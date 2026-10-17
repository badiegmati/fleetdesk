update profiles p
set company_id = '00000000-0000-0000-0000-000000000001',
    role = 'admin_societe',
    full_name = 'Admin Démo'
from auth.users u
where u.email = 'admin@fleetdesk-demo.com' and p.id = u.id;

update profiles p
set company_id = '00000000-0000-0000-0000-000000000001',
    agency_id = '00000000-0000-0000-0000-00000000a001',
    role = 'gestionnaire_agence',
    full_name = 'Gestionnaire Démo'
from auth.users u
where u.email = 'gestionnaire@fleetdesk-demo.com' and p.id = u.id;

update profiles p
set company_id = '00000000-0000-0000-0000-000000000001',
    agency_id = '00000000-0000-0000-0000-00000000a001',
    role = 'agent',
    full_name = 'Agent Démo'
from auth.users u
where u.email = 'agent@fleetdesk-demo.com' and p.id = u.id;

update profiles p
set company_id = '00000000-0000-0000-0000-000000000001',
    role = 'comptable',
    full_name = 'Comptable Démo'
from auth.users u
where u.email = 'comptable@fleetdesk-demo.com' and p.id = u.id;
