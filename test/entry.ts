import * as XLSX from 'xlsx/dist/xlsx.mini.min.js';
import { parseWorkbook } from '../src/parser';
import { mountDashboard } from '../src/dashboard';
import { makeT, DICT } from '../src/i18n';
import { sanitizePrefs } from '../src/prefs';
(window as any).TALLY = { XLSX, parseWorkbook, mountDashboard, makeT, DICT, sanitizePrefs };
