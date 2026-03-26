# AWP Data Manager - O3 Solutions Style

Este es un panel de control avanzado para la gestión y auditoría de datos técnicos en proyectos de construcción industrial, siguiendo la metodología **Advanced Work Packaging (AWP)**.

## Características Principales

### 1. Gestión de Datos
- **Carga de Datos**: Ingesta flexible de archivos Excel/CSV.
- **Edición de Datos**: Visualización y edición rápida de registros con limpieza automática.
- **Lote de Datos (Batch)**: Gestión organizada por cargas masivas.

### 2. Modelado Nodal
- **Diseño Relacional**: Interfaz visual para definir conexiones entre entidades (tablas).
- **Persistencia**: Los modelos se guardan en tiempo real en Supabase para consistencia global.

### 3. Auditoría de Integridad (Bi-direccional)
- **Análisis de Huérfanos**: Detección de registros sin conexión entre tablas relacionadas.
- **Métricas de Integridad**: Visualización dinámica de % de coincidencia y trazabilidad.
- **Edición Contextual**: Capacidad de corregir registros desde la propia vista de auditoría para "limpiar" desfasajes.

### 4. Explorador Relacional
- **Cruce de Datos (Joins)**: Capacidad de crear super-tablas cruzando información de múltiples entidades mediante sus llaves relacionadas.

## Stack Tecnológico
- **Frontend**: Next.js 14, Tailwind CSS, Lucide React.
- **Backend/Base de Datos**: Supabase (PostgreSQL).
- **Visualización**: ReactFlow (para Modelado).

---
## Desarrollo

Para ejecutar localmente:
```bash
npm run dev
```
