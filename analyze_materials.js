const XLSX = require('xlsx');
const path = require('path');

const filePath = path.join(__dirname, 'LISTADO DE PLANOS Y CANTIDADES.xlsx');
console.log('Loading file:', filePath);

try {
  const workbook = XLSX.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  // Usar sheet_to_json con defval para no perder columnas vacías
  const rawData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });
  
  if (rawData.length > 0) {
    console.log('Total rows found:', rawData.length);
    
    let currentCWP = "";
    let currentCwa = "";
    
    const processedData = rawData.map((row, index) => {
        // Si la fila tiene un CWP, actualizar el CWP actual
        if (row['CWP'] && row['CWP'] !== "-----" && row['CWP'] !== "") {
            currentCWP = row['CWP'];
        }
        
        if (row['CWA'] && row['CWA'] !== "") {
            currentCwa = row['CWA'];
        }

        return {
            ...row,
            _inferredCWP: currentCWP,
            _inferredCWA: currentCwa
        };
    });

    console.log('\n--- SAMPLE OF PROCESSED DATA (Rows 40-60) ---');
    console.log(JSON.stringify(processedData.slice(40, 60), null, 2));

    const withCwp = processedData.filter(r => r._inferredCWP !== "");
    console.log('\nRows with inferred CWP:', withCwp.length);
    
    if (withCwp.length > 0) {
        const uniqueInferredCwps = [...new Set(withCwp.map(r => r._inferredCWP))];
        console.log('Unique CWPs found after inference:', uniqueInferredCwps.length);
        console.log('Sample inferred CWPs:', uniqueInferredCwps.slice(0, 10).join(', '));
        
        // Verificar si tienen planos y cantidades
        const withPlanos = withCwp.filter(r => r['Plano'] !== "");
        console.log('Rows with Planos:', withPlanos.length);
        
        const withCantidades = withCwp.filter(r => r['Cantidad'] !== "" && r['Cantidad'] !== undefined);
        console.log('Rows with Cantidades:', withCantidades.length);
    }

  } else {
    console.log('Sheet is empty');
  }
} catch (error) {
  console.error('Error reading excel:', error);
}
