-- Enable RLS already assumed
CREATE POLICY "trainings_update_admin" ON public.trainings
FOR UPDATE USING (
  auth.role() = 'authenticated' AND (
    EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id WHERE ur.user_id=auth.uid() AND r.code IN ('ADMIN','TRAINING_EDIT'))
  )
);

CREATE POLICY "trainings_delete_admin" ON public.trainings
FOR DELETE USING (
  auth.role() = 'authenticated' AND (
    EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id WHERE ur.user_id=auth.uid() AND r.code IN ('ADMIN','TRAINING_DELETE'))
  )
);
