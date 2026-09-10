// The v2 desk's entry: the material, the chrome, the layers, and the address.
//
// THE STYLESHEET ORDER IS THE CASCADE THIS DESK WAS LOCKED AGAINST, in the same
// sequence the ★ LOCKED prototype loaded them: the shell's own rows first, then
// the app's material, then this desk's scaffold and the two shipped workstation
// sheets it seats, then the desk itself — and frontend/theme.css LAST, because
// the role rules are what win over a surface's own (see desk.css's header and
// theme.css's "themed by ROLE" note).
// Inter first, so the family every rule below names is actually available
// rather than declared and then fallen back from (HV2-08). Vendored, because
// the packaged runtime may reach no CDN (HV2-01).
import './fonts/inter.css';
import '../frontend/shell.css';
import 'virtual:harmonic/app-material.css';
import './shell.css';
import '../frontend/diagnose-workstation.css';
import '../frontend/diagnose-event-comparison.css';
import './desk.css';
import '../frontend/theme.css';

import * as echarts from 'echarts';
import { glossaryGroups } from 'virtual:harmonic/glossary';

import { renderShell } from './shell.js';
import { startDesk } from './routes.js';
import { installDay } from './day.js';
import { installUtilities } from './utilities.js';
import { installDiagnose } from './diagnose.js';
import { installChanges } from './changes.js';

// One bundled ECharts identity on the global, as frontend/main.js does for v1:
// the shipped chart modules build options, and their hosts init through this.
window.echarts = echarts;

const surface = renderShell();
// The utility layer first: it registers the seat every frame passes through and
// the first step of the Escape chain, both of which must exist before the desk
// draws its first frame.
installUtilities({ glossary: glossaryGroups });
installDay();
installDiagnose();
installChanges();
startDesk(surface);
