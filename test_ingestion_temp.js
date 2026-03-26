const { processETL } = require('./src/lib/ingestion-utils');

const sampleRows = [
  {
    "EDT": "0",
    "Nombre de tarea": "Programa Espesador de Cabeza DAND",
    "Trabajo": "97.705,97 h"
  },
  {
    "EDT": "", // Agrupador
    "Nombre de tarea": "■ MONTAJE MECÁNICO",
    "Trabajo": "50.000 h",
    "CWP": "CWP-001"
  },
  {
    "EDT": "1.1",
    "Nombre de tarea": "Instalación de bomba",
    "Trabajo": "100 h"
  }
];

const pkColumns = ["EDT"];
const cleaningRules = { trim: true, uppercase: true };
const columnTypes = { "Trabajo": "number" };

console.log('--- TESTING ETL PROCESS ---');
const result = processETL(sampleRows, pkColumns, cleaningRules, columnTypes);

console.log(JSON.stringify(result, null, 2));

// Verificaciones
const root = result.find(r => r.EDT === '0');
const child = result.find(r => r.EDT === '1.1');

console.log('\n--- VERIFICATIONS ---');
console.log('Root HH parsed:', root.Trabajo === 97705.97);
console.log('Child Discipline inherited:', child.Disciplina === 'MONTAJE MECÁ NICO' || child.Disciplina === 'MONTAJE MECÁNICO');
console.log('Child CWP inherited:', child.CWP === 'CWP-001');
