const XLSX = require('xlsx');
const path = require('path');

const filename = 'Propgrama Rev.-0 (20260315).xlsx';
const filePath = path.join(__dirname, filename);

try {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  console.log('--- SCANNING ROW 0 FOR CWP ---');
  if (data[0]) {
    data[0].forEach((col, i) => {
      if (col && String(col).toUpperCase().includes('CWP')) {
        console.log(`FOUND CWP AT INDEX ${i}: ${col}`);
      }
    });
    console.log('--- ALL ROW 0 ---');
    console.log(data[0]);
  }

} catch (error) {
  console.error('Error:', error);
}
