import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export interface SOTMapping {
  id: string;
  project_id: string;
  master_key: string;
  source_entity_id: string;
  source_attribute_name: string; // Guardamos el nombre por robustez
}

export function useSourceOfTruth(projectId: string | undefined) {
  const [mappings, setMappings] = useState<SOTMapping[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadMappings = async () => {
    if (!projectId) return;
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('sot_mappings')
        .select('*')
        .eq('project_id', projectId);
      if (error) throw error;
      setMappings(data || []);
    } catch (err) {
      console.error('Error loading SOT mappings:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMappings();
  }, [projectId]);

  const saveMapping = async (key: string, entityId: string, attributeName: string) => {
    if (!projectId) return;
    try {
      const payload = {
        project_id: projectId,
        master_key: key,
        source_entity_id: entityId,
        source_attribute_name: attributeName,
      };

      const { error } = await supabase
        .from('sot_mappings')
        .upsert(payload, { onConflict: 'project_id,master_key' });
      
      if (error) throw error;
      await loadMappings();
      return true;
    } catch (err) {
      console.error('Error saving SOT mapping:', err);
      return false;
    }
  };

  const getMapping = (key: string) => mappings.find(m => m.master_key === key);

  const resolveMasterField = (entityId: string, columnName: string) => {
    const found = mappings.find(m => 
      m.source_entity_id === entityId && 
      m.source_attribute_name.toLowerCase() === columnName.toLowerCase()
    );
    return found ? found.master_key : null;
  };

  const deleteMapping = async (key: string) => {
    if (!projectId) return;
    try {
      const { error } = await supabase
        .from('sot_mappings')
        .delete()
        .eq('project_id', projectId)
        .eq('master_key', key);
      if (error) throw error;
      await loadMappings();
      return true;
    } catch (err) {
      console.error('Error deleting SOT mapping:', err);
      return false;
    }
  };

  const clearAllMappings = async () => {
    if (!projectId) return;
    try {
      const { error } = await supabase
        .from('sot_mappings')
        .delete()
        .eq('project_id', projectId);
      if (error) throw error;
      await loadMappings();
      return true;
    } catch (err) {
      console.error('Error clearing SOT mappings:', err);
      return false;
    }
  };

  return {
    mappings,
    isLoading,
    saveMapping,
    deleteMapping,
    clearAllMappings,
    getMapping,
    resolveMasterField,
    refreshMappings: loadMappings
  };
}
