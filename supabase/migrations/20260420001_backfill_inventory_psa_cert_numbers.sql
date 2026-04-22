update collection_items
set
  psa_cert_number = regexp_replace(cert_number, '\D', '', 'g'),
  image_source = case
    when coalesce(image_source, 'none') = 'none' then 'psa'
    else image_source
  end,
  image_url = case
    when coalesce(image_url, '') = ''
      then 'https://cert-images.psa.com/' ||
           regexp_replace(cert_number, '\D', '', 'g') ||
           '/large/' ||
           regexp_replace(cert_number, '\D', '', 'g') ||
           '_f.jpg'
    else image_url
  end
where coalesce(item_kind, '') = 'inventory'
  and coalesce(psa_cert_number, '') = ''
  and length(regexp_replace(coalesce(cert_number, ''), '\D', '', 'g')) >= 5;
