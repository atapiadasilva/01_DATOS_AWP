import { supabase } from './supabase';

export const getStandardName = async (alias: string): Promise<string> => {
  const { data, error } = await supabase
    .from('alias_dictionary')
    .select('standard_name')
    .eq('alias', alias)
    .single();

  if (error || !data) return alias; // Return alias as is if no match
  return data.standard_name;
};

export const addAlias = async (standardName: string, alias: string) => {
  const { error } = await supabase
    .from('alias_dictionary')
    .insert({ standard_name: standardName, alias });
  
  return !error;
};

export const getAllAliases = async () => {
  const { data, error } = await supabase
    .from('alias_dictionary')
    .select('*')
    .order('standard_name');
  
  return data || [];
};
