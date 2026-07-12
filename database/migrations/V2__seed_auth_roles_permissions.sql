INSERT INTO roles (name, description) VALUES
    ('SUPER_ADMIN', 'Full system access'),
    ('USER', 'Standard authenticated user');

INSERT INTO permissions (code, description) VALUES
    ('users:manage', 'List and manage user accounts'),
    ('roles:manage', 'List and manage roles and permissions');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p WHERE r.name = 'SUPER_ADMIN';
