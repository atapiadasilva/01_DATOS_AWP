const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://dcipszrpnshxdmxedfpn.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRjaXBzenJwbnNoeGRteGVkZnBuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5MTMzMjksImV4cCI6MjA4OTQ4OTMyOX0.0MpLB835iCmz7e-HQLaA89bXMY4YOsRlvdp835RZBs4'
);

async function testDelete() {
  console.log('Fetching entities...');
  const { data: entities, error: errFetch } = await supabase.from('entities').select('*').eq('name', 'PROGRAMA AWP');
  
  if (errFetch || !entities || entities.length === 0) {
    console.log('Could not fetch entity PROGRAMA AWP', errFetch);
    return;
  }
  
  const id = entities[0].id;
  console.log(`Found PROGRAMA AWP with ID: ${id}. Attempting to delete...`);
  
  // 1. Data records
  const { error: err1 } = await supabase.from('data_records').delete().eq('entity_id', id);
  console.log('Data Records deletion error:', err1);
  
  // 2. Alias
  const { error: err2 } = await supabase.from('alias_dictionary').delete().eq('entity_id', id);
  console.log('Alias dictionary deletion error:', err2);
  
  // 3. Relationships
  const { data: attrs } = await supabase.from('attributes').select('id').eq('entity_id', id);
  if (attrs && attrs.length > 0) {
    const attrIds = attrs.map(a => a.id);
    const { error: err3 } = await supabase.from('relationships').delete().in('parent_attribute_id', attrIds);
    console.log('Relationships (parent) deletion error:', err3);
    
    const { error: err4 } = await supabase.from('relationships').delete().in('child_attribute_id', attrIds);
    console.log('Relationships (child) deletion error:', err4);
    
    // 4. Attributes
    const { error: err5 } = await supabase.from('attributes').delete().eq('entity_id', id);
    console.log('Attributes deletion error:', err5);
  }
  
  // 5. Entities
  const { error: err6 } = await supabase.from('entities').delete().eq('id', id);
  console.log('Entity deletion error:', err6);
  
  if (!err1 && !err2 && !err6) {
      console.log('Successfully deleted in Node script!');
  }
}

testDelete();
