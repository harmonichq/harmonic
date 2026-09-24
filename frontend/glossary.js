// The glossary groups the desk's utility layer renders, under CONTEXT.md's
// approved labels.
//
// #416 — THIS IS THE ONE HOME. Until the v1 page was retired, the desk's build
// read the Basal, ISF, I:C and General definitions out of v1's page at build
// time (through a retired build-time lift). With v1 retired the desk is the only
// shell, so they are simply the desk's own source, as that lift emitted them on
// origin/main. The Episode Log group is written here for the Day desk's bands,
// whose captions open the Glossary at it (#423, ADR 423).
export const glossaryGroups = [
          { title: 'Basal', terms: [
            { term: 'Basal rate', unit: 'U/h', def: 'The continuous background insulin Control-IQ delivers between meals and corrections.' },
            { term: 'Programmed basal', unit: 'U/h', def: "The rate set in your pump's profile for a given time of day." },
            { term: 'Delivered basal', unit: 'U/h', def: 'What Control-IQ actually delivered, which can differ from the programmed rate when the algorithm adjusts up, down, or suspends.' },
            { term: 'Clean window', def: "A stretch of time used as evidence because it wasn't disturbed by a recent bolus, meal, or algorithm correction — so the delivered basal reflects the profile setting, not a reaction to something else." },
          ] },
          { title: 'ISF', terms: [
            { term: 'ISF', unit: 'mg/dL per U — Insulin Sensitivity Factor', def: 'How much one unit of insulin is expected to lower blood glucose. A lower number means more insulin is needed to correct the same rise.' },
            { term: 'Wide CI', def: "A confidence interval (see CI below) wide enough that the estimate is uncertain — flagged so you know to weight it less." },
          ] },
          { title: 'I:C', terms: [
            { term: 'I:C', unit: 'g/U — Insulin-to-Carb ratio', def: 'How many grams of carbohydrate one unit of insulin covers. A lower number means more insulin is needed per gram of carbs.' },
          ] },
          { title: 'General', terms: [
            { term: 'CI', def: 'Confidence interval — the range an estimate is likely to fall within given the data available. Narrower means more reliable.' },
            { term: 'Epoch', def: 'A stretch over which a pump setting appears unchanged. Basal setting epochs can narrow basal measurement windows; correction factor and carb ratio measurements use the full requested window and keep setting epochs as caveats/settling context.' },
            { term: 'CGM', def: 'Continuous Glucose Monitor — the sensor providing the glucose readings shown throughout this app.' },
            { term: 'Bolus', unit: 'U', def: 'A single dose of insulin given for a meal or to correct a high, as opposed to the continuous basal rate.' },
            { term: 'IOB', def: 'Insulin On Board — insulin already delivered that is still active in the body.' },
          ] },
          { title: 'Episode Log', terms: [
            { term: 'Finding', def: "One behavioral observation and the evidence behind it. On Day, the Findings band lists the anchors of each episode the engine attributed to a Lever: the anchor that drove the episode, marked finding, and any anchor it claimed. Each such episode is one occurrence of its Lever's Finding, so the caption counts distinct Findings, never rows or episodes: two episodes attributed to the same Lever count once. Claimed anchors are counted beside it, never added in." },
            { term: 'Claimed', def: "An anchor that belongs to an episode another Finding owns — that shared fact is the whole meaning of the word. On Day, the row separately names what the anchor matched on its own, then ends with the Finding that owns its episode. On Diagnose, a claimed occurrence is one whose own Finding's criterion was not met while another Lever drove the episode. The two views keep those meanings distinct." },
            { term: 'Also checked', def: 'Anchors the engine judged and stayed silent on for a reason worth reading, such as falling just under a Lever\'s bar. They are not Findings; they stay in view because a near-miss is where a mis-set threshold hides.' },
            { term: 'Quiet', def: 'The rest of the day\'s anchors, folded into one stretch and counted rather than listed: clean (the behavior plainly did not happen), explained (a recent low or a defensive suspend already explains the move) and no data (too little recorded to judge).' },
          ] },
];
