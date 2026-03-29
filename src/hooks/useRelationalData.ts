'use client';

import { useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { detectCwpColumn } from '@/lib/cwp-utils';

interface RelationalDataOptions {
  entityId: string;
  filterValue?: string;
  filterKey?: string;
  limit?: number;
  definition?: {
    selectedExtraColumns?: any[];
    reachableEntities?: any[];
  };
  mappings?: any[];
}

export function useRelationalData() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<any>(null);

  const fetchData = useCallback(async (options: RelationalDataOptions) => {
    const { entityId, filterValue, filterKey, limit = 500, definition, mappings = [] } = options;
    
    if (!entityId) return [];

    setIsLoading(true);
    setError(null);

    try {
      // 1. Construir query base
      let query = supabase.from('data_records').select('id, data').eq('entity_id', entityId);
      
      const val = String(filterValue || '').replace(/[()]/g, '').trim();
      
      // Resolver la llave de filtrado (Prioridad: Mapeo SOT > filterKey prop > Detección automática)
      let actualFilterKey = filterKey;
      if (!actualFilterKey && mappings.length > 0) {
        actualFilterKey = mappings.find((m: any) => 
          m.master_key === 'cwp' && m.source_entity_id === entityId
        )?.source_attribute_name;
      }

      if (val) {
        if (actualFilterKey) {
          query = query.filter(`data->>${actualFilterKey}`, 'ilike', `%${val}%`);
        } else {
          // Fallback: búsqueda en columnas comunes si no hay llave definida
          const keywords = ['CWP', 'PACKAGE', 'PAQUETE', 'WBS', 'EDT', 'PLANO', 'DRAWING'];
          const orFilters = keywords.map(k => `data->>${k}.ilike.%${val}%`).join(',');
          query = query.or(orFilters);
        }
      }

      const { data: baseRecords, errorList } = await query.limit(limit);
      if (errorList) throw errorList;

      let processedRows = (baseRecords || []).map((r: any) => ({ 
        id: r.id, 
        ...r.data 
      }));

      // 2. Lógica de uniones relacionales (JOINs)
      if (definition?.selectedExtraColumns && definition.selectedExtraColumns.length > 0) {
        const { selectedExtraColumns, reachableEntities } = definition;
        const entityIdsToFetch = Array.from(new Set(selectedExtraColumns.map((c: any) => c.entityId))) as string[];
        
        const relatedDataMap: Record<string, any[]> = {};
        
        // Fetch de todas las tablas relacionadas en paralelo
        await Promise.all(entityIdsToFetch.map(async (eid: string) => {
          const { data: dr } = await supabase.from('data_records').select('id, data').eq('entity_id', eid);
          if (dr) relatedDataMap[eid] = dr.map(r => ({ __id: r.id, ...r.data }));
        }));

        // Ejecutar JOINs
        processedRows = processedRows.flatMap(baseRow => {
          let currentRows = [{ ...baseRow }];

          // Procesar cada entidad relacionada secuencialmente para permitir expansiones 1:N
          entityIdsToFetch.forEach(eid => {
            const extraCols = selectedExtraColumns.filter((c: any) => c.entityId === eid);
            const re = (reachableEntities || []).find((r: any) => r.id === eid);
            
            if (re && re.joinKey) {
              const { parentCol, childCol } = re.joinKey;
              const matches = (relatedDataMap[eid] || []).filter(r => 
                String(r[childCol] ?? '').trim().toLowerCase() === String(baseRow[parentCol] ?? '').trim().toLowerCase()
              );

              if (matches.length > 0) {
                // Expansión 1:N
                currentRows = currentRows.flatMap(cRow => 
                  matches.map(mRow => {
                    const expanded = { ...cRow };
                    extraCols.forEach((extra: any) => {
                      expanded[`JOIN::${eid}::${extra.column}`] = mRow[extra.column];
                    });
                    return expanded;
                  })
                );
              } else {
                // Rellenar con vacíos si no hay match
                currentRows = currentRows.map(cRow => {
                  const nullRow = { ...cRow };
                  extraCols.forEach((extra: any) => {
                    nullRow[`JOIN::${eid}::${extra.column}`] = '—';
                  });
                  return nullRow;
                });
              }
            }
          });
          return currentRows;
        });
      }

      return processedRows;
    } catch (err) {
      console.error('Error en useRelationalData:', err);
      setError(err);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { fetchData, isLoading, error };
}
