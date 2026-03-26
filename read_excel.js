const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, 'PROGRAMA DE OBRA ACTUALIZADO.xlsx');
console.log('Loading file:', filePath);

try {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  console.log('Sheet name:', sheetName);
  
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  
  if (data.length > 0) {
    console.log('\n--- HEADERS (Row 0) ---');
    console.log(data[0]);
    
    // Si la fila 0 está vacía o es un título gigante, intentemos buscar la fila de headers.
    let headerRow = 0;
    for (let i = 0; i < 5; i++) {
        if (data[i] && data[i].length > 3) {
            headerRow = i;
            break;
        }
    }
    
    console.log(`\n--- HEADERS AT ROW ${headerRow} ---`);
    console.log(data[headerRow]);

    console.log('\n--- FIRST 3 DATA ROWS ---');
    for (let i = headerRow + 1; i < headerRow + 4; i++) {
        if (data[i]) console.log(data[i]);
    }
    
    // Convert to strict JSON objects
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { range: headerRow });
    console.log('\n--- FIRST 2 PARSED OBJECTS ---');
    console.log(JSON.stringify(jsonData.slice(0, 2), null, 2));

  } else {
    console.log('Sheet is empty');
  }
} catch (error) {
  console.error('Error reading excel:', error);
}
