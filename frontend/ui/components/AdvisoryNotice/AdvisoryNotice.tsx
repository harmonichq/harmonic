// AdvisoryNotice (§4.2): what the app says once, before any tab (§2.5,
// 2026-11-02). §1.5's Advisory term as its title and its meaning beneath, then
// Understood, the one primary. The words are the Glossary's, marked as the
// Glossary's so the sentence rule's one exception covers them.
import { Button } from '../Button/Button';
import './AdvisoryNotice.css';

export type AdvisoryNoticeProps = {
  term: string;
  meaning: string;
  onUnderstood: () => void;
};

export function AdvisoryNotice({ term, meaning, onUnderstood }: AdvisoryNoticeProps) {
  return (
    <main className="ui-advisory">
      <div className="ui-advisory__body">
        <div className="glossary">
          <h1 className="ui-advisory__term">{term}</h1>
          <p className="ui-advisory__meaning">{meaning}</p>
        </div>
        <Button kind="primary" label="Understood" onClick={onUnderstood} />
      </div>
    </main>
  );
}
