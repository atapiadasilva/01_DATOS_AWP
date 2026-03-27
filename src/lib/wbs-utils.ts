import { WBSNode, WBSTreeResult } from '../types/wbs';

/**
 * Convierte un EDT string en un array de números para comparación numérica.
 * Ejemplo: "1.10.2" -> [1, 10, 2]
 */
export const parseEDT = (edt: string): number[] => {
  if (!edt) return [];
  return String(edt).split('.').map(part => {
    const num = parseInt(part, 10);
    return isNaN(num) ? 0 : num;
  });
};

/**
 * Obtiene el nivel de profundidad de un EDT.
 */
export const getLevel = (edt: string): number => {
  return parseEDT(edt).length;
};

/**
 * Obtiene el EDT del padre.
 */
export const getParentEDT = (edt: string): string | null => {
  const parts = String(edt).split('.');
  if (parts.length <= 1) return null;
  return parts.slice(0, -1).join('.');
};

/**
 * Compara dos códigos EDT de forma numérica.
 * Garantiza que "1.10" > "1.9".
 */
export const compareWBS = (a: string, b: string): number => {
  const partsA = parseEDT(a);
  const partsB = parseEDT(b);
  
  const maxLength = Math.max(partsA.length, partsB.length);
  
  for (let i = 0; i < maxLength; i++) {
    const valA = partsA[i] || 0;
    const valB = partsB[i] || 0;
    
    if (valA !== valB) {
      return valA - valB;
    }
  }
  
  return 0;
};

/**
 * Función auxiliar para parsear fechas de forma robusta
 */
const parseSafeDate = (val: any): Date | null => {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
};

/**
 * Construye el árbol WBS y realiza los cálculos de Roll-up.
 */
export const buildWBSTree = (records: any[], edtKey: string): WBSTreeResult => {
  const nodesMap = new Map<string, WBSNode>();
  let maxLevel = 0;

  // 1. Crear nodos básicos desde los registros
  records.forEach(record => {
    if (!record) return;
    
    // Obtener el objeto de datos (manejando tanto estructura Supabase cruda como aplanada)
    const rowData = record.data || record;
    const edt = String(rowData[edtKey] || '').trim();
    if (!edt) return;

    const level = getLevel(edt);
    if (level > maxLevel) maxLevel = level;

    const node: WBSNode = {
      id: edt,
      name: rowData['Nombre de tarea'] || rowData['Nombre'] || rowData['Descripción'] || rowData['name'] || 'Tarea',
      parentId: getParentEDT(edt),
      level,
      type: 'task', // Por defecto task, se cambiará a project si tiene hijos
      start: parseSafeDate(rowData['Comienzo Actual'] || rowData['Comienzo'] || rowData['Inicio'] || rowData['aStart']) || new Date(),
      end: parseSafeDate(rowData['Fin Actual'] || rowData['Fin'] || rowData['Término'] || rowData['aEnd']) || new Date(),
      baselineStart: parseSafeDate(rowData['Comienzo de línea base1'] || rowData['bStart']) || undefined,
      baselineEnd: parseSafeDate(rowData['Fin de línea base1'] || rowData['bEnd']) || undefined,
      work: parseFloat(rowData['Trabajo'] || rowData['HH'] || rowData['Esfuerzo'] || rowData['hh']) || 0,
      progress: parseFloat(rowData['% trabajo completado'] || rowData['%'] || rowData['Avance'] || rowData['pct']) || 0,
      children: [],
      metadata: rowData,
      isExpanded: true,
      isVisible: true
    };
    
    nodesMap.set(edt, node);
  });

  // 2. Asegurar que existan todos los padres (incluso si no están en el Excel)
  const allEdts = Array.from(nodesMap.keys());
  allEdts.forEach(edt => {
    let parent = getParentEDT(edt);
    while (parent) {
      if (!nodesMap.has(parent)) {
        nodesMap.set(parent, {
          id: parent,
          name: `Resumen ${parent}`,
          parentId: getParentEDT(parent),
          level: getLevel(parent),
          type: 'project',
          start: new Date(),
          end: new Date(),
          work: 0,
          progress: 0,
          children: [],
          metadata: {},
          isExpanded: true,
          isVisible: true
        });
      }
      parent = getParentEDT(parent);
    }
  });

  // 3. Establecer relaciones padre-hijo
  nodesMap.forEach(node => {
    if (node.parentId && nodesMap.has(node.parentId)) {
      const parent = nodesMap.get(node.parentId)!;
      parent.children.push(node);
      parent.type = 'project';
    }
  });

  // 4. Lógica de Roll-up Recursiva
  const performRollup = (node: WBSNode) => {
    if (node.children.length === 0) return;

    // Ejecutar recursivamente para los hijos primero
    node.children.forEach(performRollup);

    // Calcular valores resumen
    const childStarts = node.children.map(c => c.start.getTime()).filter(t => !isNaN(t));
    const childEnds = node.children.map(c => c.end.getTime()).filter(t => !isNaN(t));
    const childBaselineStarts = node.children.map(c => c.baselineStart?.getTime()).filter((t): t is number => !!t && !isNaN(t));
    const childBaselineEnds = node.children.map(c => c.baselineEnd?.getTime()).filter((t): t is number => !!t && !isNaN(t));

    if (childStarts.length > 0) node.start = new Date(Math.min(...childStarts));
    if (childEnds.length > 0) node.end = new Date(Math.max(...childEnds));
    if (childBaselineStarts.length > 0) node.baselineStart = new Date(Math.min(...childBaselineStarts));
    if (childBaselineEnds.length > 0) node.baselineEnd = new Date(Math.max(...childBaselineEnds));

    node.work = node.children.reduce((acc, c) => acc + c.work, 0);

    // % Completado ponderado por Trabajo (HH)
    if (node.work > 0) {
      const totalWeightedProgress = node.children.reduce((acc, c) => acc + (c.progress * c.work), 0);
      node.progress = totalWeightedProgress / node.work;
    } else {
      // Si no hay trabajo, promedio simple o por duración (simplificado a promedio simple aquí)
      node.progress = node.children.reduce((acc, c) => acc + c.progress, 0) / node.children.length;
    }
  };

  // 5. Ordenar raíces y aplanar
  const rootTasks = Array.from(nodesMap.values())
    .filter(n => !n.parentId)
    .sort((a, b) => compareWBS(a.id, b.id));

  rootTasks.forEach(performRollup);

  const flatTasks: WBSNode[] = [];
  const flatten = (nodes: WBSNode[]) => {
    nodes.sort((a, b) => compareWBS(a.id, b.id)).forEach(node => {
      flatTasks.push(node);
      if (node.children.length > 0) {
        flatten(node.children);
      }
    });
  };
  flatten(rootTasks);

  return { rootTasks, flatTasks, maxLevel };
};
