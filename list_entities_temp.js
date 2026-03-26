const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://dcipszrpnshxdmxedfpn.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjaXBzenJwbnNoeGRteGVkZnBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5MTMzMjksImV4cCI6MjA4OTQ4OTMyOX0.0MpLB835iCmz7e-HQLaA89bXMY4YOsRlvdp835RZBs4';

const supabase = createClient(supabaseUrl, supabaseKey);

async function listEntities() {
  const { data, error } = await supabase.from('entities').select('id, name');
  if (error) {
    console.error('Error:', error);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

listEntities();
