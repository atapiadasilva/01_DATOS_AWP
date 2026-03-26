/**
 * Migración: Agregar columnas canvas_x y canvas_y a la tabla entities
 * Ejecutar con: node migrate_canvas_positions.js
 */
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function migrate() {
  console.log('🚀 Iniciando migración...');
  
  // Verificar que podemos conectar
  const { data: test, error: testErr } = await supabase.from('entities').select('id').limit(1);
  if (testErr) {
    console.error('❌ Error de conexión:', testErr.message);
    process.exit(1);
  }
  
  console.log('✅ Conexión con Supabase establecida.');
  console.log('');
  console.log('⚠️  Para agregar las columnas canvas_x y canvas_y, ejecuta el siguiente SQL');
  console.log('   directamente en el SQL Editor de tu proyecto en Supabase:');
  console.log('');
  console.log('   👉 https://supabase.com/dashboard/project/dcipszrpnshxdmxedfpn/sql/new');
  console.log('');
  console.log('   Copia y pega este SQL:');
  console.log('   ─────────────────────────────────────────────────────────');
  console.log('   ALTER TABLE entities');
  console.log('   ADD COLUMN IF NOT EXISTS canvas_x float8,');
  console.log('   ADD COLUMN IF NOT EXISTS canvas_y float8;');
  console.log('   ─────────────────────────────────────────────────────────');
  console.log('');
  console.log('   Luego haz clic en "Run" para ejecutar.');
  console.log('');
  
  process.exit(0);
}

migrate();
