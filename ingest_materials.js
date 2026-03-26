const { createClient } = require('@supabase/supabase-js');
const XLSX = require('xlsx');
const path = require('path');

// Cargar variables de entorno (manualmente para simplicidad)
const SUPABASE_URL = "https://dcipszrpnshxdmxedfpn.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjaXBzenJwbnNoeGRteGVkZnBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDEyMzYxODIsImV4cCI6MjA1NjgyMDE4Mn0.pLB835iCmz7e-HQLaA89bXMY4YOsRlvdp835RZBs4mV4cCI6MjA4OTQ4OTMyOX0.0Mp";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const ENTITY_NAME = 'Log de Planos y Cantidades';
const PROJECT_ID = '00000000-0000-0000-0000-000000000000';
const FILE_PATH = path.join(__dirname, 'LISTADO DE PLANOS Y CANTIDADES.xlsx');

async function ingest() {
    console.log('--- STARTING INGESTION ---');
    
    try {
        const workbook = XLSX.readFile(FILE_PATH);
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawData = XLSX.utils.sheet_to_json(worksheet, { defval: "" });

        if (rawData.length === 0) {
            console.error('No data found in Excel');
            return;
        }

        console.log(`Read ${rawData.length} rows from Excel`);

        // 1. Inferencia de CWP y CWA
        let currentCWP = "";
        let currentCWA = "";
        const processedRows = [];

        for (const row of rawData) {
            if (row['CWP'] && row['CWP'] !== "-----" && row['CWP'] !== "") {
                currentCWP = String(row['CWP']).trim();
            }
            if (row['CWA'] && row['CWA'] !== "") {
                currentCWA = String(row['CWA']).trim();
            }

            // Solo agregar si tiene algo sustancial (ej. Disciplina o Cantidad o Plano)
            if (row['Disciplina'] || row['Cantidad'] || row['Plano']) {
                processedRows.push({
                    ...row,
                    'CWP': currentCWP,
                    'CWA': currentCWA,
                    '__original_cwp': row['CWP']
                });
            }
        }

        console.log(`Processed ${processedRows.length} valid rows with inferred CWPs`);

        // 2. Asegurar que la entidad existe
        let { data: entity, error: entityError } = await supabase
            .from('entities')
            .select('id')
            .eq('project_id', PROJECT_ID)
            .eq('name', ENTITY_NAME)
            .single();

        let entityId;
        if (entityError || !entity) {
            console.log('Creating new entity:', ENTITY_NAME);
            const { data: newEntity, error: createError } = await supabase
                .from('entities')
                .insert({ project_id: PROJECT_ID, name: ENTITY_NAME, file_type: 'xlsx' })
                .select().single();
            if (createError) throw createError;
            entityId = newEntity.id;
        } else {
            entityId = entity.id;
            console.log('Using existing entity ID:', entityId);
            // Opcional: Limpiar registros anteriores
            await supabase.from('data_records').delete().eq('entity_id', entityId);
        }

        // 3. Insertar Atributos
        const cols = Object.keys(processedRows[0]);
        const attributes = cols.map(col => ({
            entity_id: entityId,
            name: col,
            data_type: (col === 'Cantidad' || col === 'Peso \r\n(ref. kg)') ? 'number' : 'text',
            is_pk: false
        }));

        console.log('Updating attributes...');
        await supabase.from('attributes').upsert(attributes, { onConflict: 'entity_id, name' });

        // 4. Insertar Data Records en chunks
        console.log('Inserting records...');
        const chunkSize = 200;
        for (let i = 0; i < processedRows.length; i += chunkSize) {
            const chunk = processedRows.slice(i, i + chunkSize);
            const records = chunk.map(row => ({
                entity_id: entityId,
                data: row
            }));
            const { error: insertError } = await supabase.from('data_records').insert(records);
            if (insertError) {
                console.error(`Error in chunk ${i}:`, insertError);
            } else {
                console.log(`Inserted chunk ${i / chunkSize + 1} / ${Math.ceil(processedRows.length / chunkSize)}`);
            }
        }

        console.log('--- INGESTION COMPLETE ---');

    } catch (err) {
        console.error('Ingestion failed:', JSON.stringify(err, null, 2));
        if (err.message) console.error('Error message:', err.message);
        if (err.details) console.error('Error details:', err.details);
    }
}

ingest();
