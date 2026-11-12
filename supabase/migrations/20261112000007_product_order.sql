-- Order of products on the tally card: the points-earning products first, then the supporting equipment.
update public.products set sort = v.sort from (values
  ('sonitrol_intrusion', 1), ('managed_access', 2), ('verified_video', 3), ('s1000', 4), ('warranty', 5),
  ('audio_sensor', 6), ('multi_sensor', 7), ('fire_panel', 8), ('fire_communicator', 9), ('nvr_other', 10)
) as v(key, sort) where products.key = v.key;
