const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = "https://dcipszrpnshxdmxedfpn.supabase.co";
const SERVICE_KEY  = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjaXBzenJwbnNoeGRteGVkZnBuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MzkxMzMyOSwiZXhwIjoyMDg5NDg5MzI5fQ.lJ3IywDSFOwYhc3CvsRCMQdUAlMgBcofEYEBpFSOB78";

const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

async function check() {
  console.log('\n=== VERIFICACIÓN TABLA aps_element_links ===\n');

  // 1. Check if table exists by querying it
  const { data: links, error: linkErr } = await supabase
    .from('aps_element_links')
    .select('*')
    .limit(5);

  if (linkErr) {
    console.error('❌ TABLA NO EXISTE o error:', linkErr.message);
    console.log('\n→ Debes ejecutar la migración 018_aps_element_links.sql en Supabase SQL Editor');
  } else {
    console.log(`✅ Tabla aps_element_links EXISTS. Filas encontradas: ${links.length}`);
    if (links.length > 0) {
      console.log('Muestra:', JSON.stringify(links, null, 2));
    } else {
      console.log('(tabla vacía - no hay asignaciones aún)');
    }
  }

  // 2. Check projects
  const { data: projects } = await supabase.from('projects').select('id, name');
  console.log('\n=== PROYECTOS ===');
  (projects ?? []).forEach(p => console.log(`  ${p.id}  ${p.name}`));
}

check().catch(console.error);
