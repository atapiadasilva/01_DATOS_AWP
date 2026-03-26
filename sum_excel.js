const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, 'PROGRAMA DE OBRA ACTUALIZADO.xlsx');

try {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  
  let headerRow = 0;
  for (let i = 0; i < 5; i++) {
      if (data[i] && data[i].length > 3) {
          headerRow = i;
          break;
      }
  }
  
  const jsonData = XLSX.utils.sheet_to_json(worksheet, { range: headerRow });
  
  let totalHH = 0;
  
  // En Ms Project a veces las filas "padre" tienen la suma de sus hijos. 
  // Para ver si hay un total en la fila 0 o si la suma de los "hijos" (hojas) da el total.
  // Solo sumaremos las filas que tengan un EDT válido de cierto nivel, o sumemos todas para ver el máximo.
  
  let maxTotal = 0;
  
  jsonData.forEach(row => {
    let trabajo = row['Trabajo'];
    if (trabajo && typeof trabajo === 'string') {
      let numStr = trabajo.replace('h', '').replace(/ /g, '').trim();
      numStr = numStr.replace(/\./g, '').replace(',', '.'); 
      let val = parseFloat(numStr);
      if (!isNaN(val)) {
         if (val > maxTotal) maxTotal = val; // Assuming the highest single row might be the grand total
         
         if (val.toFixed(2) === '94367.64') {
             console.log('!!! EXACT ROW MATCH FOR 94367.64:', row);
         }
      }
    }
  });

  console.log('Max individual row HH value:', maxTotal);
  
} catch (error) {
  console.error('Error reading excel:', error);
}
