-- 021_weekly_plan_sort.sql
-- Add sort_order to weekly_plan_activities to support drag-and-drop reordering

ALTER TABLE weekly_plan_activities 
ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;
