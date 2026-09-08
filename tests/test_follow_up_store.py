"""Durable follow-up persistence through Store, using manufactured records."""

import os
import tempfile
import unittest

from ciq_autotune.store import Store


class FollowUpStoreTest(unittest.TestCase):
    def test_outer_failure_rolls_back_legacy_writes(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, 'synthetic.sqlite')
            with Store.open(path) as store:
                revision = store.input_data_revision()
                with self.assertRaisesRegex(RuntimeError, 'abort lifecycle'):
                    with store.follow_up_transaction(expected_revision=revision) as transaction:
                        self.assertIs(transaction, store)
                        store.save_plan_draft([{'type': 'basal', 'key': 0, 'value': 0.7}],
                                              '2026-09-01 08:00:00')
                        store.apply_plan('2026-09-01 09:00:00')
                        store.pin_focus('late_bolus', '2026-09-01 10:00:00')
                        raise RuntimeError('abort lifecycle')
                self.assertEqual(store.plan_history(), [])
                self.assertEqual(store.list_focuses(), [])
                self.assertIsNone(store.get_plan_draft())
                self.assertEqual(store.input_data_revision(), revision)


# These bounded values are manufactured here; no source data or generated files.
T0 = '2026-09-01 08:00:00'
T1 = '2026-09-02 09:00:00'
T2 = '2026-09-03 10:00:00'
ITEMS = [{'type': 'basal', 'key': 0, 'value': 0.7}]


def available(**fields):
    return {'version': '386:1', 'state': 'available', **fields}


def context(label='observed'):
    return available(captured_at=T1, action=label, explanation='Manufactured evidence summary',
                     source_window={'start': T0, 'end': T1}, input_revision=0,
                     policy='synthetic:1', subjects=['basal:0'], occurrences=[],
                     settings=[{'value': 0.7, 'unit': 'U/h'}], support=[], unknowns=[])


def trial(id='basal:0:20260902090000', changed_at=T1):
    return {'kind': 'trial', 'id': id, 'version': '386:1',
            'parameter': 'basal_rate', 'slot': '00:00', 'changed_at': changed_at,
            'before': 0.6, 'after': 0.7, 'block': None, 'members': None,
            'first_observed_at': T2, 'observed_context': context(),
            'comparison_context': context('comparison')}


def ending(kind='user_finished', conclusion='Done watching'):
    return available(kind=kind, effective_at=T2, recorded_at=T2, conclusion=conclusion,
                     assessment=available(periods={'before': {'start': T0, 'end': T1},
                                                   'after': {'start': T1, 'end': T2}},
                                          comparison_context=context('comparison'),
                                          outcomes=[{'value': 0, 'unit': '%',
                                                     'denominator': 'observed CGM readings',
                                                     'n': 24}],
                                          assessment='unclear', limitations=['synthetic']))


class DurableFollowUpTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = os.path.join(self.tmp.name, 'synthetic.sqlite')
        self.store = Store.open(self.path)
        self.addCleanup(lambda: self.store.close())

    def reopen(self):
        self.store.close()
        self.store = Store.open(self.path)

    def save_trial(self, record=None):
        with self.store.follow_up_transaction():
            return self.store.save_follow_up_record(record or trial())

    def apply(self, at=T0):
        self.store.save_plan_draft(ITEMS, at)
        return self.store.apply_plan(at)

    def test_restart_retains_all_three_records_and_original_legacy_shapes(self):
        with self.store.follow_up_transaction(expected_revision=0):
            plan = self.apply()
            p = self.store.save_follow_up_record({
                'kind': 'plan', 'id': T0, 'version': '386:1',
                'decision_context': context('apply'),
                'deliverable': available(source_profile='synthetic-profile', items=ITEMS,
                                         ic_provenance=None)})
            focus = self.store.pin_focus('late_bolus', T0)
            f = self.store.save_follow_up_record({
                'kind': 'focus', 'id': focus['id'], 'version': '386:1',
                'decision_context': context('pin'), 'comparison_context': context('fixed')})
            t = self.store.save_follow_up_record(trial())
            frontier = self.store.advance_follow_up_frontier(
                t['id'], T1, reconciled_input_revision=self.store.input_data_revision())
            result = {'record': t, 'admission': {'state': 'available', 'active_id': t['id']}}
            self.assertEqual(self.store.save_follow_up_request(
                'reconcile-1', operation='reconcile', kind='trial', id=t['id'], result=result), result)
        self.assertEqual(self.store.input_data_revision(), 1)
        self.reopen()
        self.assertEqual(self.store.plan_history(), [plan])
        self.assertEqual(self.store.list_focuses(), [focus])
        self.assertEqual(self.store.follow_up_record('plan', T0), p)
        self.assertEqual(self.store.follow_up_record('focus', focus['id']), f)
        self.assertEqual(self.store.follow_up_record('trial', t['id']), t)
        self.assertEqual(self.store.follow_up_request('reconcile-1')['result'], result)
        self.assertEqual(self.store.follow_up_frontier(), frontier)
        self.assertEqual(frontier['reconciled_input_revision'], 1)

    def test_first_observation_context_and_block_never_replaced(self):
        original = trial('carb_ratio:12-18:20260902090000')
        original.update(parameter='carb_ratio', slot='12:00', before=8, after=9,
                        block=[720, 1080], members=[720, 900])
        winner = self.save_trial(original)
        replacement = {**original, 'changed_at': T0, 'before': 3, 'after': 4,
                       'block': [0, 1440], 'members': [0], 'first_observed_at': T1,
                       'observed_context': context('replacement'),
                       'comparison_context': context('today')}
        revision = self.store.input_data_revision()
        self.assertEqual(self.save_trial(replacement), winner)
        self.assertEqual(self.store.input_data_revision(), revision)
        self.reopen()
        self.assertEqual(self.store.follow_up_record('trial', original['id']), winner)
        self.assertNotIn('decision_context', winner)
        self.assertEqual(winner['reconciliation']['state'], 'unavailable')

    def test_first_ending_and_assessment_survive_changed_retry(self):
        original = self.save_trial()
        first = {**original, 'ending': ending()}
        winner = self.save_trial(first)
        revision = self.store.input_data_revision()
        retry = {**first, 'ending': ending('superseded', None)}
        retry['ending']['recorded_at'] = T1
        retry['ending']['assessment'] = available(assessment='improved')
        self.assertEqual(self.save_trial(retry), winner)
        self.assertEqual(self.store.input_data_revision(), revision)
        self.reopen()
        self.assertEqual(self.store.follow_up_record('trial', original['id']), winner)

    def test_later_relationship_fills_absence_but_not_original_context(self):
        first = self.save_trial()
        self.apply()
        receipt = available(applied_at=T0, trial_id=first['id'], matched_at=T2,
                            observed_change=first['id'], matched_deliverable=ITEMS,
                            captured_block=None)
        with self.store.follow_up_transaction():
            linked = self.store.save_follow_up_record({**first, 'reconciliation': receipt,
                                                       'observed_context': context('changed')})
            plan = self.store.follow_up_record('plan', T0)
            self.store.save_follow_up_record({**plan, 'reconciliation': receipt})
        self.assertEqual(linked['observed_context'], first['observed_context'])
        self.assertEqual(linked['reconciliation'], receipt)
        self.apply(T1)
        with self.store.follow_up_transaction():
            retried = self.store.save_follow_up_record({
                **linked, 'reconciliation': {**receipt, 'applied_at': T1}})
        self.assertEqual(retried, linked)
        self.reopen()
        self.assertEqual(self.store.follow_up_record('plan', T0)['reconciliation'], receipt)

    def test_unknown_or_cross_subject_relationship_rolls_back(self):
        from ciq_autotune.store import FollowUpConflict
        first = self.save_trial()
        for plan_id, trial_id in ((T0, first['id']), (T1, 'another-trial')):
            with self.subTest(plan_id=plan_id):
                revision = self.store.input_data_revision()
                with self.assertRaises(FollowUpConflict):
                    with self.store.follow_up_transaction():
                        self.store.save_follow_up_record({**first, 'reconciliation': available(
                            applied_at=plan_id, trial_id=trial_id)})
                self.assertEqual(self.store.input_data_revision(), revision)
                self.assertEqual(self.store.follow_up_record('trial', first['id']), first)

    def test_withdrawal_is_first_wins_and_does_not_remove_plan(self):
        self.apply()
        record = self.store.follow_up_record('plan', T0)
        withdrawal = available(withdrawn_at=T1, reason='Changed my mind')
        with self.store.follow_up_transaction():
            winner = self.store.save_follow_up_record({**record, 'withdrawal': withdrawal})
        with self.store.follow_up_transaction():
            retried = self.store.save_follow_up_record({
                **record, 'withdrawal': available(withdrawn_at=T2, reason='retry')})
        self.assertEqual(retried, winner)
        self.reopen()
        self.assertEqual(self.store.follow_up_record('plan', T0)['withdrawal'], withdrawal)
        self.assertEqual(self.store.plan_history(), [{'applied_at': T0, 'items': ITEMS}])

    def test_noop_and_nested_writes_advance_revision_only_once(self):
        with self.store.follow_up_transaction() as outer:
            with self.store.follow_up_transaction(expected_revision=0) as inner:
                self.assertIs(inner, outer)
        self.assertEqual(self.store.input_data_revision(), 0)
        with self.store.follow_up_transaction():
            self.apply()
            with self.store.follow_up_transaction(expected_revision=1):
                self.store.pin_focus('late_bolus', T1)
                self.store.save_follow_up_record(trial())
            self.assertEqual(self.store.input_data_revision(), 1)
        self.assertEqual(self.store.input_data_revision(), 1)
        with self.store.follow_up_transaction(expected_revision=1):
            self.store.resolve_focus(999)
            self.store.save_follow_up_record(trial())
        self.assertEqual(self.store.input_data_revision(), 1)

    def test_failure_rolls_back_records_ending_request_frontier_and_focus(self):
        t = self.save_trial()
        f = self.store.pin_focus('late_bolus', T0)
        revision = self.store.input_data_revision()
        with self.assertRaisesRegex(RuntimeError, 'abort all'):
            with self.store.follow_up_transaction(expected_revision=revision):
                self.store.save_follow_up_record({**t, 'ending': ending()})
                self.store.resolve_focus(f['id'], 'dropped')
                self.store.save_follow_up_record(trial('new-trial', T2))
                self.store.advance_follow_up_frontier(
                    'new-trial', T2, reconciled_input_revision=self.store.input_data_revision())
                self.store.save_follow_up_request('finish', operation='finish', kind='trial',
                                                  id=t['id'], result={'ending': ending()})
                raise RuntimeError('abort all')
        self.reopen()
        self.assertEqual(self.store.follow_up_record('trial', t['id']), t)
        self.assertEqual(self.store.active_focus(), f)
        self.assertIsNone(self.store.follow_up_record('trial', 'new-trial'))
        self.assertIsNone(self.store.follow_up_request('finish'))
        self.assertIsNone(self.store.follow_up_frontier())
        self.assertEqual(self.store.input_data_revision(), revision)

    def test_caught_nested_failure_cannot_publish_partial_changes(self):
        from ciq_autotune.store import FollowUpConflict
        with self.assertRaises(FollowUpConflict) as raised:
            with self.store.follow_up_transaction():
                self.apply()
                try:
                    with self.store.follow_up_transaction():
                        self.store.save_follow_up_record(trial())
                        raise RuntimeError('nested failure')
                except RuntimeError:
                    pass
        self.assertEqual(raised.exception.reason, 'transaction_aborted')
        self.assertEqual(self.store.plan_history(), [])
        self.assertEqual(self.store.follow_up_records('trial'), [])
        self.assertEqual(self.store.input_data_revision(), 0)

    def test_stale_revision_checks_before_any_write(self):
        from ciq_autotune.store import FollowUpConflict
        self.save_trial()
        with self.assertRaises(FollowUpConflict) as raised:
            with self.store.follow_up_transaction(expected_revision=0):
                self.fail('stale input entered the transaction body')
        self.assertEqual(raised.exception.reason, 'stale_input_revision')
        self.assertEqual(raised.exception.actual_revision, 1)
        self.assertEqual(self.store.input_data_revision(), 1)

    def test_first_request_result_and_identity_survive_restart(self):
        from ciq_autotune.store import FollowUpConflict
        t = self.save_trial()
        with self.store.follow_up_transaction():
            self.store.save_follow_up_request('finish-1', operation='finish', kind='trial',
                                              id=t['id'], result={'ending': ending()})
        self.reopen()
        revision = self.store.input_data_revision()
        with self.store.follow_up_transaction():
            result = self.store.save_follow_up_request('finish-1', operation='finish', kind='trial',
                                                        id=t['id'], result={'ending': ending('reverted')})
        self.assertEqual(result, {'ending': ending()})
        self.assertEqual(self.store.input_data_revision(), revision)
        for operation, kind, id in [('resolve', 'trial', t['id']),
                                    ('finish', 'trial', 'different'), ('finish', 'focus', 1)]:
            with self.subTest(operation=operation, kind=kind, id=id):
                with self.assertRaises(FollowUpConflict):
                    with self.store.follow_up_transaction():
                        self.store.save_follow_up_request('finish-1', operation=operation,
                                                          kind=kind, id=id, result={})
                self.assertEqual(self.store.input_data_revision(), revision)

    def test_frontier_retains_finished_disappeared_and_same_instant_peer(self):
        with self.store.follow_up_transaction():
            self.store.save_follow_up_record(trial('z'))
            self.store.save_follow_up_record(trial('a'))
            self.store.advance_follow_up_frontier('z', T1, reconciled_input_revision=1)
            winner = self.store.advance_follow_up_frontier('a', T1, reconciled_input_revision=1)
        self.assertEqual(winner['trial_id'], 'a')
        with self.store.follow_up_transaction():
            self.store.save_follow_up_record({**trial('a'), 'ending': ending()})
            self.store.save_follow_up_record(trial('0-peer'))
            self.store.save_follow_up_record(trial('older', T0))
            for id, time in [('0-peer', T1), ('older', T0), (None, None)]:
                self.assertEqual(self.store.advance_follow_up_frontier(
                    id, time, reconciled_input_revision=self.store.input_data_revision())['trial_id'], 'a')
        self.reopen()
        self.assertEqual(self.store.follow_up_frontier()['trial_id'], 'a')
        with self.store.follow_up_transaction():
            self.store.save_follow_up_record(trial('new', T2))
            self.store.advance_follow_up_frontier('new', T2, reconciled_input_revision=3)
        self.assertEqual(self.store.follow_up_frontier(), {
            'trial_id': 'new', 'detected_at': T2, 'reconciled_input_revision': 3})

    def test_empty_frontier_stamps_committed_revision_and_retry_is_noop(self):
        with self.store.follow_up_transaction():
            frontier = self.store.advance_follow_up_frontier(None, None, reconciled_input_revision=0)
        self.assertEqual(frontier, {'trial_id': None, 'detected_at': None, 'reconciled_input_revision': 1})
        self.assertEqual(self.store.input_data_revision(), 1)
        with self.store.follow_up_transaction():
            self.assertEqual(self.store.advance_follow_up_frontier(
                None, None, reconciled_input_revision=1), frontier)
        self.assertEqual(self.store.input_data_revision(), 1)
        with self.store.follow_up_transaction():
            self.store.advance_follow_up_frontier(None, None, reconciled_input_revision=1)
            self.store.pin_focus('late_bolus', T1)
        self.assertEqual(self.store.follow_up_frontier()['reconciled_input_revision'], 2)

    def test_frontier_rejects_unknown_trial_wrong_time_and_stale_input(self):
        from ciq_autotune.store import FollowUpConflict
        self.save_trial(trial('known'))
        for id, time, revision in [('missing', T1, 1), ('known', T0, 1), ('known', T1, 0)]:
            with self.subTest(id=id, time=time, revision=revision):
                with self.assertRaises(FollowUpConflict):
                    with self.store.follow_up_transaction():
                        self.store.advance_follow_up_frontier(id, time, reconciled_input_revision=revision)
                self.assertIsNone(self.store.follow_up_frontier())
                self.assertEqual(self.store.input_data_revision(), 1)

    def test_lists_use_canonical_ties_and_existing_focus_order(self):
        for id, time in [('b', T1), ('old', T0), ('a', T1), ('new', T2)]:
            self.save_trial(trial(id, time))
        for _ in range(2):
            f = self.store.pin_focus('late_bolus', T1)
            self.store.resolve_focus(f['id'])
        self.assertEqual([r['id'] for r in self.store.follow_up_records('trial')], ['new', 'a', 'b', 'old'])
        self.assertEqual([r['id'] for r in self.store.follow_up_records('focus')], [2, 1])
        self.assertIsNone(self.store.follow_up_record('trial', 'absent'))
        self.assertIsNone(self.store.follow_up_record('focus', 999))
        self.assertIsNone(self.store.follow_up_record('plan', T0))

    def test_new_writes_require_transaction_and_valid_bounded_records(self):
        from ciq_autotune.store import FollowUpConflict
        with self.assertRaises(FollowUpConflict):
            self.store.save_follow_up_record(trial())
        invalid = [dict(trial(), kind='other'), dict(trial(), id=''),
                   dict(trial(), version='wrong'), dict(trial(), changed_at='yesterday'),
                   dict(trial(), observed_context={'state': 'available'}),
                   dict(trial(), raw_cgm=[1, 2, 3]),
                   dict(trial(), observed_context=context('x' * 262144))]
        for record in invalid:
            with self.subTest(record_keys=list(record)):
                with self.assertRaises(ValueError):
                    with self.store.follow_up_transaction():
                        self.store.save_follow_up_record(record)
                self.assertEqual(self.store.follow_up_records('trial'), [])
        for kind, id in [('plan', T0), ('focus', 1)]:
            with self.assertRaises(FollowUpConflict):
                with self.store.follow_up_transaction():
                    self.store.save_follow_up_record({'kind': kind, 'id': id, 'version': '386:1'})
        self.assertEqual(self.store.input_data_revision(), 0)

    def test_readonly_history_never_writes_or_resolves_focus(self):
        import sqlite3
        self.save_trial({**trial(), 'ending': ending()})
        self.apply()
        focus = self.store.pin_focus('late_bolus', T0)
        self.store.close()
        for opener in (Store.open_readonly, Store.open_queryonly):
            with opener(self.path) as reader:
                statements = []
                reader.conn.set_trace_callback(statements.append)
                for kind in ('trial', 'plan', 'focus'):
                    self.assertEqual(len(reader.follow_up_records(kind)), 1)
                self.assertEqual(reader.active_focus(), focus)
                reader.follow_up_frontier()
                reader.follow_up_request('unknown')
                self.assertTrue(all(s.lstrip().upper().startswith('SELECT') for s in statements), statements)
                self.assertEqual(reader.conn.total_changes, 0)
                with self.assertRaises(sqlite3.OperationalError):
                    with reader.follow_up_transaction():
                        self.fail('readonly transaction entered')
                with self.assertRaises(sqlite3.OperationalError):
                    reader.save_follow_up_record(trial())
        self.store = Store.open(self.path)

    def test_legacy_closed_focus_cannot_acquire_a_guessed_ending(self):
        from ciq_autotune.store import FollowUpConflict
        focus = self.store.pin_focus('late_bolus', T0)
        self.store.resolve_focus(focus['id'])
        record = self.store.follow_up_record('focus', focus['id'])
        # Persisting its explicit unknown envelope must not make a later invented
        # ending eligible to replace the missing historical fact.
        with self.store.follow_up_transaction():
            self.store.save_follow_up_record(record)
        revision = self.store.input_data_revision()
        with self.assertRaises(FollowUpConflict):
            with self.store.follow_up_transaction():
                self.store.save_follow_up_record({**record, 'ending': ending('manual')})
        self.assertEqual(self.store.input_data_revision(), revision)
        self.assertEqual(self.store.follow_up_record('focus', focus['id'])['ending']['state'], 'unavailable')

    def test_unavailable_final_assessment_is_retained_without_inventing_a_result(self):
        record = trial()
        final = ending()
        final['assessment'] = {'version': '386:1', 'state': 'unavailable',
                               'reason': 'evidence_missing'}
        saved = self.save_trial({**record, 'ending': final})
        self.reopen()
        self.assertEqual(self.store.follow_up_record('trial', record['id']), saved)
        self.assertEqual(saved['ending']['assessment']['reason'], 'evidence_missing')

    def test_competing_finish_preemption_and_request_receipts_preserve_first_winner(self):
        from concurrent.futures import ThreadPoolExecutor
        from threading import Barrier
        from ciq_autotune.store import FollowUpConflict
        focus = self.store.pin_focus('late_bolus', T0)
        with self.store.follow_up_transaction():
            self.store.save_follow_up_record({'kind': 'focus', 'id': focus['id'], 'version': '386:1',
                                             'decision_context': context('pin')})
        revision = self.store.input_data_revision()
        ready = Barrier(2)

        def attempt(kind, status):
            with Store.open(self.path) as writer:
                ready.wait(timeout=10)
                try:
                    with writer.follow_up_transaction(expected_revision=revision):
                        record = writer.follow_up_record('focus', focus['id'])
                        final = ending(kind, None if status == 'dropped' else 'Done')
                        saved = writer.save_follow_up_record({**record, 'ending': final})
                        writer.resolve_focus(focus['id'], status)
                        result = {'ending': saved['ending']}
                        writer.save_follow_up_request('end-focus', operation='resolve', kind='focus',
                                                      id=focus['id'], result=result)
                    return ('committed', result, status)
                except FollowUpConflict as exc:
                    return ('conflict', exc.reason, exc.actual_revision)

        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(attempt, 'manual', 'resolved'),
                       pool.submit(attempt, 'trial_preempted', 'dropped')]
            results = [future.result(timeout=15) for future in futures]
        winner = next(row for row in results if row[0] == 'committed')
        loser = next(row for row in results if row[0] == 'conflict')
        self.assertEqual(loser, ('conflict', 'stale_input_revision', revision + 1))
        self.reopen()
        record = self.store.follow_up_record('focus', focus['id'])
        self.assertEqual(record['ending'], winner[1]['ending'])
        self.assertEqual(record['status'], winner[2])
        self.assertIsNone(self.store.active_focus())
        self.assertEqual(self.store.follow_up_request('end-focus')['result'], winner[1])
        with self.store.follow_up_transaction():
            retried = self.store.save_follow_up_request('end-focus', operation='resolve', kind='focus',
                                                        id=focus['id'], result={'ending': ending()})
        self.assertEqual(retried, winner[1])
        self.assertEqual(self.store.input_data_revision(), revision + 1)

    def test_competing_pins_keep_one_active_focus_and_rollback_loser(self):
        from concurrent.futures import ThreadPoolExecutor
        from threading import Barrier
        from ciq_autotune.store import FocusAlreadyActive
        ready = Barrier(2)

        def pin():
            with Store.open(self.path) as writer:
                ready.wait(timeout=10)
                try:
                    with writer.follow_up_transaction():
                        row = writer.pin_focus('late_bolus', T0)
                        writer.save_follow_up_record({'kind': 'focus', 'id': row['id'],
                                                      'version': '386:1', 'decision_context': context()})
                    return row
                except FocusAlreadyActive:
                    return None

        with ThreadPoolExecutor(max_workers=2) as pool:
            futures = [pool.submit(pin), pool.submit(pin)]
            results = [future.result(timeout=15) for future in futures]
        self.assertEqual(sum(row is not None for row in results), 1)
        self.assertEqual(len(self.store.follow_up_records('focus')), 1)
        self.assertEqual(self.store.input_data_revision(), 1)

    def test_ingestion_writer_joins_follow_up_rollback(self):
        revision = self.store.input_data_revision()
        with self.assertRaisesRegex(RuntimeError, 'failed reconciliation'):
            with self.store.follow_up_transaction():
                self.store.upsert_cgm([{'EventDateTime': T1, 'Readings (CGM / BGM)': 100}])
                self.store.save_follow_up_record(trial())
                raise RuntimeError('failed reconciliation')
        self.assertEqual(self.store.cgm_readings(), [])
        self.assertEqual(self.store.follow_up_records('trial'), [])
        self.assertEqual(self.store.input_data_revision(), revision)

    def test_resolve_then_capture_ending_joins_same_transaction(self):
        focus = self.store.pin_focus('late_bolus', T0)
        with self.store.follow_up_transaction():
            self.store.resolve_focus(focus['id'])
            saved = self.store.save_follow_up_record({
                'kind': 'focus', 'id': focus['id'], 'version': '386:1', 'ending': ending('manual')})
        self.reopen()
        self.assertEqual(self.store.follow_up_record('focus', focus['id']), saved)
        self.assertEqual(saved['status'], 'resolved')
        self.assertEqual(saved['ending'], ending('manual'))

    def test_sql_failure_is_not_translated_to_a_lifecycle_conflict(self):
        import sqlite3
        with self.assertRaises(sqlite3.IntegrityError):
            with self.store.follow_up_transaction():
                self.store.save_follow_up_record(trial())
                self.store.pin_focus(None, T0)
        self.assertEqual(self.store.follow_up_records('trial'), [])
        self.assertEqual(self.store.input_data_revision(), 0)

    def test_incomplete_or_cross_kind_ending_is_rejected_without_partial_record(self):
        for final in [ending('manual'), ending('reverted', 'invented user conclusion'),
                      {**ending(), 'assessment': None}, {**ending(), 'effective_at': None},
                      {**ending(), 'assessment': {'version': '386:1', 'state': 'unavailable'}}]:
            with self.subTest(kind=final['kind']):
                with self.assertRaises(ValueError):
                    self.save_trial({**trial(), 'ending': final})
                self.assertEqual(self.store.follow_up_records('trial'), [])
                self.assertEqual(self.store.input_data_revision(), 0)

    def test_invalid_request_and_frontier_writes_leave_no_partial_result(self):
        from ciq_autotune.store import FollowUpConflict
        t = self.save_trial()
        with self.assertRaises(FollowUpConflict):
            self.store.save_follow_up_request('id', operation='finish', kind='trial', id=t['id'], result={})
        with self.assertRaises(FollowUpConflict):
            self.store.advance_follow_up_frontier(t['id'], T1, reconciled_input_revision=1)
        for request_id, operation, result in [('', 'finish', {}), ('id', '', {}),
                                             ('id', 'finish', []), ('id', 'finish', {'text': 'x' * 262144})]:
            with self.subTest(request_id=request_id, operation=operation):
                with self.assertRaises(ValueError):
                    with self.store.follow_up_transaction():
                        self.store.save_follow_up_request(request_id, operation=operation,
                                                          kind='trial', id=t['id'], result=result)
        with self.assertRaises(FollowUpConflict):
            with self.store.follow_up_transaction():
                self.store.save_follow_up_request('missing', operation='finish',
                                                  kind='trial', id='unknown', result={})
        with self.assertRaises(ValueError):
            with self.store.follow_up_transaction():
                self.store.advance_follow_up_frontier(None, T1, reconciled_input_revision=1)
        self.assertEqual(self.store.input_data_revision(), 1)
        self.assertIsNone(self.store.follow_up_request('id'))
        self.assertIsNone(self.store.follow_up_frontier())

    def test_legacy_plan_key_is_preserved_exactly_as_stored(self):
        key = '2026-09-01T08:00:00.123'
        self.apply(key)
        self.assertEqual(self.store.follow_up_record('plan', key)['id'], key)
        self.assertEqual(self.store.follow_up_records('plan')[0]['applied_at'], key)

    def test_recorded_ending_with_unavailable_time_is_still_first_wins(self):
        unknown = {**ending('reverted', None), 'state': 'unavailable',
                   'reason': 'event_time_missing', 'effective_at': None}
        original = self.save_trial()
        saved = self.save_trial({**original, 'ending': unknown})
        self.assertEqual(saved['ending'], unknown)
        revision = self.store.input_data_revision()
        retry = self.save_trial({**trial(), 'ending': ending()})
        self.assertEqual(retry, saved)
        self.assertEqual(self.store.input_data_revision(), revision)
