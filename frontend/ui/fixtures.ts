// The stories' adapter (#483, #495): the served answers in ui-fixtures.json,
// generated from the synthetic QA store and stamped as such, made the answers
// every model reads (answers.ts). Only the stories import this module, so the
// built app never carries the fixture file.
import data from './__fixtures__/ui-fixtures.json';
import { serve } from './answers';

export { sourced, type Format, type Sourced } from './answers';

export const fixtures = data;
serve(data);
