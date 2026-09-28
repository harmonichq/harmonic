"""Meal identity (ADR 470): a meal is its first carb bolus plus its same-meal top-ups."""

import unittest
from datetime import datetime, timedelta

from ciq_autotune.analyzers.meals import group_meals
from ciq_autotune.events import BolusEvent

NOON = datetime(2024, 5, 3, 12, 0)


def bolus(minute, carbs, insulin=2.0, *, seq_num=None, completion="Completed",
          carb_ratio=10.0):
    return BolusEvent(t=NOON + timedelta(minutes=minute), carbs=carbs, insulin=insulin,
                      completion=completion, carb_ratio=carb_ratio,
                      seq_num=seq_num if seq_num is not None else 1000 + minute)


def minutes(meal):
    return [round((member.t - NOON).total_seconds() / 60) for member in meal.members]


class GroupMealsTest(unittest.TestCase):
    def test_top_ups_within_the_grace_join_and_the_next_bolus_opens_a_meal(self):
        meals = group_meals([bolus(0, 45), bolus(10, 20), bolus(30, 20), bolus(31, 20)])

        self.assertEqual([minutes(meal) for meal in meals], [[0, 10, 30], [31]])
        self.assertEqual(meals[0].t, NOON)
        self.assertEqual(meals[0].seq_num, 1000)
        self.assertEqual(meals[0].carbs, 85)

    def test_the_grace_is_measured_from_the_first_bolus_and_never_chained(self):
        meals = group_meals([bolus(0, 45), bolus(20, 20), bolus(40, 20)])

        self.assertEqual([minutes(meal) for meal in meals], [[0, 20], [40]])

    def test_sub_floor_and_carb_free_boluses_are_never_members(self):
        meals = group_meals([bolus(0, 45), bolus(5, 9.9), bolus(10, None), bolus(15, 0)])

        self.assertEqual([minutes(meal) for meal in meals], [[0]])
        self.assertEqual(meals[0].insulin, 2.0)

    def test_two_meal_boluses_at_one_instant_form_one_meal_ordered_by_seq_num(self):
        later = bolus(0, 20, seq_num=9)
        earlier = bolus(0, 45, seq_num=5)

        (meal,) = group_meals([later, earlier])

        self.assertEqual([member.seq_num for member in meal.members], [5, 9])
        self.assertIs(meal.first, earlier)
        self.assertEqual(meal.seq_num, 5)

    def test_a_cancelled_leg_and_its_re_issue_count_the_carbs_once(self):
        cancelled = bolus(0, 45, 0.5, completion="User Aborted")
        re_issue = bolus(2, 45, 4.5)

        (meal,) = group_meals([cancelled, re_issue])

        self.assertEqual(meal.carbs, 45)
        self.assertEqual(meal.insulin, 5.0)
        self.assertIs(meal.first, cancelled)

    def test_a_meal_is_judged_at_its_first_members_stamped_carb_ratio(self):
        (meal,) = group_meals([bolus(0, 45, carb_ratio=10.0), bolus(10, 20, carb_ratio=12.0)])

        self.assertEqual(meal.carb_ratio, 10.0)

    def test_a_meal_whose_only_completed_member_is_its_top_up_is_completed(self):
        (meal,) = group_meals([bolus(0, 45, 0.0, completion="User Aborted"), bolus(10, 20)])

        self.assertTrue(meal.completed)

    def test_a_meal_with_no_completed_member_is_not_completed(self):
        (meal,) = group_meals([bolus(0, 45, 0.5, completion="User Aborted")])

        self.assertFalse(meal.completed)
        self.assertEqual(meal.carbs, 45)


if __name__ == "__main__":
    unittest.main()
