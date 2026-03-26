const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkSchema() {
  const { data, error } = await supabase.from('attributes').select('*').limit(1);
  if (error) {
    console.error('Error fetching attributes:', error);
  } else {
    console.log('Sample attribute row:', data[0]);
    console.log('Columns:', Object.keys(data[0] || {}));
  }
}

checkSchema();
