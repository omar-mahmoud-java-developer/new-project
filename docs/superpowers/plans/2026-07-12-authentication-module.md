# Authentication Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship registration, login, JWT-access/rotating-refresh-cookie session management, logout, password reset, and the RBAC (users/roles/permissions) schema + enforcement scaffolding, backend and frontend, per `docs/superpowers/specs/2026-07-12-authentication-module-design.md`.

**Architecture:** Backend: Spring Boot modules following the existing empty package scaffold (`modules.users`, `modules.roles`, `modules.permissions`, `modules.authentication`, `security`, `shared.mail`, `shared.web`). JWT access token (stateless, HS256) + opaque rotating refresh token in an HttpOnly cookie (DB-backed, revocable). Frontend: a new `features/auth/` with 4 pages, a Zustand `authStore` (in-memory only), a thin fetch wrapper with silent-refresh-on-401, and a public/protected route split in `App.tsx`.

**Tech Stack:** Spring Boot 3.3.5, Java 21, Spring Security, Spring Data JPA, PostgreSQL, Flyway, `io.jsonwebtoken:jjwt` (added by this plan), JUnit 5, Mockito, `spring-security-test`. React 18, TypeScript, Zustand, React Router, TanStack Query (not needed for auth itself, but present in the app).

## Global Constraints

- Package layout is fixed by the spec: `com.enterprise.erp.security`, `com.enterprise.erp.modules.users`, `com.enterprise.erp.modules.roles`, `com.enterprise.erp.modules.permissions`, `com.enterprise.erp.modules.authentication`, `com.enterprise.erp.shared.mail`, `com.enterprise.erp.shared.web`. Do not invent other packages.
- Access token TTL: 15 minutes. Refresh token TTL: 7 days. Password reset token TTL: 1 hour.
- Refresh tokens are opaque random strings (NOT JWTs), stored **hashed** (SHA-256 is sufficient — they're high-entropy random tokens, not passwords) in `refresh_tokens`, rotated on every use, with reuse-of-a-replaced-token revoking the whole chain.
- Access token is returned in the JSON response body. Refresh token is set as an `HttpOnly`, `SameSite=Strict` cookie named `refreshToken`, path `/api/auth`, never present in any JSON response body.
- Password reset tokens are opaque random strings, stored **hashed**, single-use (`used_at` set on confirm), in `password_reset_tokens`.
- All new tables use `snake_case`, `id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY`, `created_at TIMESTAMPTZ NOT NULL DEFAULT now()` where applicable — match Postgres/Flyway conventions already implied by `application.yml` (`ddl-auto: validate`, meaning the schema is migration-owned, entities must match it exactly, not the other way around).
- Flyway migrations live in `database/migrations/`, named `V{n}__{description}.sql`, sequential starting at `V1` (nothing exists yet).
- `mvn -f backend/pom.xml verify` (runs tests + checkstyle + spotless) must pass after every backend task. Spotless auto-formats Java to Google Java Format — run `mvn -f backend/pom.xml spotless:apply` before `verify` if a task's checkstyle/spotless check fails on formatting.
- `npm run check` (in `frontend/`) must pass after every frontend task.
- No hardcoded secrets: JWT signing secret comes from `JWT_SECRET` env var with a dev-only fallback default in `application.yml`, matching the existing `${SPRING_DATASOURCE_URL:jdbc:...}` pattern.
- No audit-log integration — `com.enterprise.erp.audit` is out of scope, do not touch it.

---

### Task 1: JWT dependency + config properties

**Files:**
- Modify: `backend/pom.xml`
- Modify: `backend/src/main/resources/application.yml`

**Interfaces:**
- Produces: `jjwt-api`/`jjwt-impl`/`jjwt-jackson` (0.12.6) on the classpath, and three new config properties consumed by Task 5's `JwtProvider`: `app.jwt.secret` (string, min 32 chars), `app.jwt.access-token-ttl-minutes` (int, `15`), `app.jwt.refresh-token-ttl-days` (int, `7`). Also `app.security.cors.allowed-origin` (string, default `http://localhost:5173`) consumed by Task 5's `CorsConfig`.

- [ ] **Step 1: Add JWT dependencies to `backend/pom.xml`** — inside `<dependencies>`, after the `postgresql` dependency block, add:

```xml
    <dependency>
      <groupId>io.jsonwebtoken</groupId>
      <artifactId>jjwt-api</artifactId>
      <version>0.12.6</version>
    </dependency>
    <dependency>
      <groupId>io.jsonwebtoken</groupId>
      <artifactId>jjwt-impl</artifactId>
      <version>0.12.6</version>
      <scope>runtime</scope>
    </dependency>
    <dependency>
      <groupId>io.jsonwebtoken</groupId>
      <artifactId>jjwt-jackson</artifactId>
      <version>0.12.6</version>
      <scope>runtime</scope>
    </dependency>
```

- [ ] **Step 2: Add config properties to `backend/src/main/resources/application.yml`** — after the `spring:` block's `rabbitmq:` section (same indentation level as `spring`, `server`, `management`, `logging` — i.e. a new top-level key), add:

```yaml
app:
  jwt:
    secret: ${JWT_SECRET}
    access-token-ttl-minutes: ${JWT_ACCESS_TTL_MINUTES:15}
    refresh-token-ttl-days: ${JWT_REFRESH_TTL_DAYS:7}
  security:
    cors:
      allowed-origin: ${CORS_ALLOWED_ORIGIN:http://localhost:5173}
```

**Security-corrected from the original draft of this step** (caught by automated review after this task first landed): `app.jwt.secret` has **no fallback** in the base config — an unset `JWT_SECRET` must fail application startup, not silently sign tokens with a well-known default (that would be a full auth-bypass: anyone could forge a valid token, including with a `SUPER_ADMIN` role claim). The dev-only fallback instead goes in `application-dev.yml` and `application-test.yml` (added in this same step):

`backend/src/main/resources/application-dev.yml` gains:
```yaml
app:
  jwt:
    secret: ${JWT_SECRET:dev-only-insecure-secret-change-me-32chars-minimum}
```

`backend/src/main/resources/application-test.yml` gains:
```yaml
app:
  jwt:
    secret: test-only-insecure-secret-change-me-32chars-minimum
```

Base `application.yml` already sets `spring.profiles.active: dev` by default, so local `mvnw spring-boot:run`/tests still work with zero setup; only a real deployment that explicitly activates a non-dev/test profile without setting `JWT_SECRET` will fail to start — which is the correct, fail-closed behavior.

- [ ] **Step 3: Verify dependencies resolve**

Run: `cd "/home/omar/new project/backend" && ./mvnw -q dependency:resolve -Dclassloader.loglevel=WARN`
Expected: exits 0, no `Could not resolve dependencies` error.

- [ ] **Step 4: Verify the project still compiles (no code uses the new config yet, this just proves YAML/POM are well-formed)**

Run: `cd "/home/omar/new project/backend" && ./mvnw -q compile`
Expected: `BUILD SUCCESS` (no output on `-q` success).

- [ ] **Step 5: Commit**

```bash
cd "/home/omar/new project" && git add backend/pom.xml backend/src/main/resources/application.yml
git commit -m "build: add JWT dependency and auth config properties"
```

---

### Task 2: Flyway schema migration (users/roles/permissions/tokens)

**Files:**
- Create: `database/migrations/V1__create_auth_schema.sql`

**Interfaces:**
- Produces: tables `users`, `roles`, `permissions`, `role_permissions`, `user_roles`, `refresh_tokens`, `password_reset_tokens` — exact column names below are consumed verbatim by Task 3/4's JPA entities via `@Column(name = "...")`.

- [ ] **Step 1: Create `database/migrations/V1__create_auth_schema.sql`**

```sql
CREATE TABLE users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE roles (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description VARCHAR(255)
);

CREATE TABLE permissions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    code VARCHAR(100) NOT NULL UNIQUE,
    description VARCHAR(255)
);

CREATE TABLE role_permissions (
    role_id BIGINT NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
    permission_id BIGINT NOT NULL REFERENCES permissions (id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE user_roles (
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role_id BIGINT NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE refresh_tokens (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    replaced_by_token_id BIGINT REFERENCES refresh_tokens (id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_refresh_tokens_user_id ON refresh_tokens (user_id);

CREATE TABLE password_reset_tokens (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    used_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_password_reset_tokens_user_id ON password_reset_tokens (user_id);
```

- [ ] **Step 2: Create `database/migrations/V2__seed_auth_roles_permissions.sql`**

```sql
INSERT INTO roles (name, description) VALUES
    ('SUPER_ADMIN', 'Full system access'),
    ('USER', 'Standard authenticated user');

INSERT INTO permissions (code, description) VALUES
    ('users:manage', 'List and manage user accounts'),
    ('roles:manage', 'List and manage roles and permissions');

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r, permissions p WHERE r.name = 'SUPER_ADMIN';
```

- [ ] **Step 3: Verify migrations are valid SQL syntax (no live DB required for this check — Flyway validates on application startup in later tasks; this step just sanity-checks the files parse)**

Run: `psql --version || echo "psql not available, skipping local lint — will be validated when the app starts in Task 12"`
If `psql` is available, optionally run: `psql -h localhost -U erp -d erp -f "/home/omar/new project/database/migrations/V1__create_auth_schema.sql" --single-transaction --set ON_ERROR_STOP=1 2>&1 | tail -20 || echo "no live DB yet, that's fine — full validation happens in Task 12"`

- [ ] **Step 4: Commit**

```bash
cd "/home/omar/new project" && git add database/migrations/V1__create_auth_schema.sql database/migrations/V2__seed_auth_roles_permissions.sql
git commit -m "feat: add Flyway migrations for auth/RBAC schema and seed data"
```

---

### Task 3: User, Role, Permission entities + repositories

**Files:**
- Create: `backend/src/main/java/com/enterprise/erp/modules/users/User.java`
- Create: `backend/src/main/java/com/enterprise/erp/modules/users/UserRepository.java`
- Create: `backend/src/main/java/com/enterprise/erp/modules/roles/Role.java`
- Create: `backend/src/main/java/com/enterprise/erp/modules/roles/RoleRepository.java`
- Create: `backend/src/main/java/com/enterprise/erp/modules/permissions/Permission.java`
- Create: `backend/src/main/java/com/enterprise/erp/modules/permissions/PermissionRepository.java`

**Interfaces:**
- Consumes: table/column names from Task 2's `V1__create_auth_schema.sql`.
- Produces: `User` (fields: `id`, `email`, `passwordHash`, `fullName`, `isActive`, `roles: Set<Role>`, `createdAt`, `updatedAt`), `Role` (fields: `id`, `name`, `description`, `permissions: Set<Permission>`), `Permission` (fields: `id`, `code`, `description`) — consumed by Task 4 (`RefreshToken`/`PasswordResetToken` reference `User`), Task 7 (`AuthService`), Task 9 (`AuthController`'s protected sample endpoint lists `User`).
- `UserRepository extends JpaRepository<User, Long>` with `Optional<User> findByEmail(String email)` and `boolean existsByEmail(String email)` and `long count()` (inherited, used for the first-user-is-admin check).
- `RoleRepository extends JpaRepository<Role, Long>` with `Optional<Role> findByName(String name)`.
- `PermissionRepository extends JpaRepository<Permission, Long>` (no extra methods needed yet).

- [ ] **Step 1: Create `backend/src/main/java/com/enterprise/erp/modules/permissions/Permission.java`**

```java
package com.enterprise.erp.modules.permissions;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.util.Objects;

@Entity
@Table(name = "permissions")
public class Permission {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false, unique = true)
  private String code;

  private String description;

  protected Permission() {}

  public Permission(String code, String description) {
    this.code = code;
    this.description = description;
  }

  public Long getId() {
    return id;
  }

  public String getCode() {
    return code;
  }

  public String getDescription() {
    return description;
  }

  @Override
  public boolean equals(Object o) {
    if (this == o) return true;
    if (!(o instanceof Permission other)) return false;
    return id != null && id.equals(other.id);
  }

  @Override
  public int hashCode() {
    return Objects.hashCode(id);
  }
}
```

- [ ] **Step 2: Create `backend/src/main/java/com/enterprise/erp/modules/permissions/PermissionRepository.java`**

```java
package com.enterprise.erp.modules.permissions;

import org.springframework.data.jpa.repository.JpaRepository;

public interface PermissionRepository extends JpaRepository<Permission, Long> {}
```

- [ ] **Step 3: Create `backend/src/main/java/com/enterprise/erp/modules/roles/Role.java`**

```java
package com.enterprise.erp.modules.roles;

import com.enterprise.erp.modules.permissions.Permission;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.Table;
import java.util.HashSet;
import java.util.Objects;
import java.util.Set;

@Entity
@Table(name = "roles")
public class Role {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false, unique = true)
  private String name;

  private String description;

  @ManyToMany(fetch = FetchType.EAGER)
  @JoinTable(
      name = "role_permissions",
      joinColumns = @JoinColumn(name = "role_id"),
      inverseJoinColumns = @JoinColumn(name = "permission_id"))
  private Set<Permission> permissions = new HashSet<>();

  protected Role() {}

  public Role(String name, String description) {
    this.name = name;
    this.description = description;
  }

  public Long getId() {
    return id;
  }

  public String getName() {
    return name;
  }

  public String getDescription() {
    return description;
  }

  public Set<Permission> getPermissions() {
    return permissions;
  }

  @Override
  public boolean equals(Object o) {
    if (this == o) return true;
    if (!(o instanceof Role other)) return false;
    return id != null && id.equals(other.id);
  }

  @Override
  public int hashCode() {
    return Objects.hashCode(id);
  }
}
```

- [ ] **Step 4: Create `backend/src/main/java/com/enterprise/erp/modules/roles/RoleRepository.java`**

```java
package com.enterprise.erp.modules.roles;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RoleRepository extends JpaRepository<Role, Long> {
  Optional<Role> findByName(String name);
}
```

- [ ] **Step 5: Create `backend/src/main/java/com/enterprise/erp/modules/users/User.java`**

```java
package com.enterprise.erp.modules.users;

import com.enterprise.erp.modules.roles.Role;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.HashSet;
import java.util.Objects;
import java.util.Set;

@Entity
@Table(name = "users")
public class User {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false, unique = true)
  private String email;

  @Column(name = "password_hash", nullable = false)
  private String passwordHash;

  @Column(name = "full_name", nullable = false)
  private String fullName;

  @Column(name = "is_active", nullable = false)
  private boolean active = true;

  @ManyToMany(fetch = FetchType.EAGER)
  @JoinTable(
      name = "user_roles",
      joinColumns = @JoinColumn(name = "user_id"),
      inverseJoinColumns = @JoinColumn(name = "role_id"))
  private Set<Role> roles = new HashSet<>();

  @Column(name = "created_at", nullable = false)
  private Instant createdAt = Instant.now();

  @Column(name = "updated_at", nullable = false)
  private Instant updatedAt = Instant.now();

  protected User() {}

  public User(String email, String passwordHash, String fullName) {
    this.email = email;
    this.passwordHash = passwordHash;
    this.fullName = fullName;
  }

  public Long getId() {
    return id;
  }

  public String getEmail() {
    return email;
  }

  public String getPasswordHash() {
    return passwordHash;
  }

  public void setPasswordHash(String passwordHash) {
    this.passwordHash = passwordHash;
    this.updatedAt = Instant.now();
  }

  public String getFullName() {
    return fullName;
  }

  public boolean isActive() {
    return active;
  }

  public Set<Role> getRoles() {
    return roles;
  }

  public Instant getCreatedAt() {
    return createdAt;
  }

  public Instant getUpdatedAt() {
    return updatedAt;
  }

  @Override
  public boolean equals(Object o) {
    if (this == o) return true;
    if (!(o instanceof User other)) return false;
    return id != null && id.equals(other.id);
  }

  @Override
  public int hashCode() {
    return Objects.hashCode(id);
  }
}
```

- [ ] **Step 6: Create `backend/src/main/java/com/enterprise/erp/modules/users/UserRepository.java`**

```java
package com.enterprise.erp.modules.users;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserRepository extends JpaRepository<User, Long> {
  Optional<User> findByEmail(String email);

  boolean existsByEmail(String email);
}
```

- [ ] **Step 7: Verify compilation**

Run: `cd "/home/omar/new project/backend" && ./mvnw -q compile`
Expected: `BUILD SUCCESS`, no errors. (There is no live DB yet, so this only proves the Java/JPA mapping code compiles — `ddl-auto: validate` against a real schema is exercised in Task 12.)

- [ ] **Step 8: Commit**

```bash
cd "/home/omar/new project" && git add backend/src/main/java/com/enterprise/erp/modules/users backend/src/main/java/com/enterprise/erp/modules/roles backend/src/main/java/com/enterprise/erp/modules/permissions
git commit -m "feat: add User, Role, Permission JPA entities and repositories"
```

---

### Task 4: RefreshToken, PasswordResetToken entities + repositories

**Files:**
- Create: `backend/src/main/java/com/enterprise/erp/modules/authentication/RefreshToken.java`
- Create: `backend/src/main/java/com/enterprise/erp/modules/authentication/RefreshTokenRepository.java`
- Create: `backend/src/main/java/com/enterprise/erp/modules/authentication/PasswordResetToken.java`
- Create: `backend/src/main/java/com/enterprise/erp/modules/authentication/PasswordResetTokenRepository.java`

**Interfaces:**
- Consumes: `User` entity from Task 3.
- Produces: `RefreshToken` (fields: `id`, `user`, `tokenHash`, `expiresAt`, `revokedAt`, `replacedByTokenId`, `createdAt`) and `PasswordResetToken` (fields: `id`, `user`, `tokenHash`, `expiresAt`, `usedAt`, `createdAt`) — consumed by Task 7 (`AuthService`) and Task 8 (`PasswordResetService`).
- `RefreshTokenRepository extends JpaRepository<RefreshToken, Long>` with `Optional<RefreshToken> findByTokenHash(String tokenHash)` and `List<RefreshToken> findAllByUserIdAndRevokedAtIsNull(Long userId)`.
- `PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, Long>` with `Optional<PasswordResetToken> findByTokenHash(String tokenHash)`.

- [ ] **Step 1: Create `backend/src/main/java/com/enterprise/erp/modules/authentication/RefreshToken.java`**

```java
package com.enterprise.erp.modules.authentication;

import com.enterprise.erp.modules.users.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Objects;

@Entity
@Table(name = "refresh_tokens")
public class RefreshToken {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(optional = false)
  @JoinColumn(name = "user_id", nullable = false)
  private User user;

  @Column(name = "token_hash", nullable = false, unique = true)
  private String tokenHash;

  @Column(name = "expires_at", nullable = false)
  private Instant expiresAt;

  @Column(name = "revoked_at")
  private Instant revokedAt;

  @Column(name = "replaced_by_token_id")
  private Long replacedByTokenId;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt = Instant.now();

  protected RefreshToken() {}

  public RefreshToken(User user, String tokenHash, Instant expiresAt) {
    this.user = user;
    this.tokenHash = tokenHash;
    this.expiresAt = expiresAt;
  }

  public Long getId() {
    return id;
  }

  public User getUser() {
    return user;
  }

  public String getTokenHash() {
    return tokenHash;
  }

  public Instant getExpiresAt() {
    return expiresAt;
  }

  public Instant getRevokedAt() {
    return revokedAt;
  }

  public void revoke() {
    this.revokedAt = Instant.now();
  }

  public Long getReplacedByTokenId() {
    return replacedByTokenId;
  }

  public void setReplacedByTokenId(Long replacedByTokenId) {
    this.replacedByTokenId = replacedByTokenId;
  }

  public boolean isActive() {
    return revokedAt == null && expiresAt.isAfter(Instant.now());
  }

  @Override
  public boolean equals(Object o) {
    if (this == o) return true;
    if (!(o instanceof RefreshToken other)) return false;
    return id != null && id.equals(other.id);
  }

  @Override
  public int hashCode() {
    return Objects.hashCode(id);
  }
}
```

- [ ] **Step 2: Create `backend/src/main/java/com/enterprise/erp/modules/authentication/RefreshTokenRepository.java`**

```java
package com.enterprise.erp.modules.authentication;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface RefreshTokenRepository extends JpaRepository<RefreshToken, Long> {
  Optional<RefreshToken> findByTokenHash(String tokenHash);

  List<RefreshToken> findAllByUserIdAndRevokedAtIsNull(Long userId);
}
```

- [ ] **Step 3: Create `backend/src/main/java/com/enterprise/erp/modules/authentication/PasswordResetToken.java`**

```java
package com.enterprise.erp.modules.authentication;

import com.enterprise.erp.modules.users.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.time.Instant;
import java.util.Objects;

@Entity
@Table(name = "password_reset_tokens")
public class PasswordResetToken {

  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @ManyToOne(optional = false)
  @JoinColumn(name = "user_id", nullable = false)
  private User user;

  @Column(name = "token_hash", nullable = false, unique = true)
  private String tokenHash;

  @Column(name = "expires_at", nullable = false)
  private Instant expiresAt;

  @Column(name = "used_at")
  private Instant usedAt;

  @Column(name = "created_at", nullable = false)
  private Instant createdAt = Instant.now();

  protected PasswordResetToken() {}

  public PasswordResetToken(User user, String tokenHash, Instant expiresAt) {
    this.user = user;
    this.tokenHash = tokenHash;
    this.expiresAt = expiresAt;
  }

  public Long getId() {
    return id;
  }

  public User getUser() {
    return user;
  }

  public String getTokenHash() {
    return tokenHash;
  }

  public Instant getExpiresAt() {
    return expiresAt;
  }

  public Instant getUsedAt() {
    return usedAt;
  }

  public void markUsed() {
    this.usedAt = Instant.now();
  }

  public boolean isValid() {
    return usedAt == null && expiresAt.isAfter(Instant.now());
  }

  @Override
  public boolean equals(Object o) {
    if (this == o) return true;
    if (!(o instanceof PasswordResetToken other)) return false;
    return id != null && id.equals(other.id);
  }

  @Override
  public int hashCode() {
    return Objects.hashCode(id);
  }
}
```

- [ ] **Step 4: Create `backend/src/main/java/com/enterprise/erp/modules/authentication/PasswordResetTokenRepository.java`**

```java
package com.enterprise.erp.modules.authentication;

import java.util.Optional;
import org.springframework.data.jpa.repository.JpaRepository;

public interface PasswordResetTokenRepository extends JpaRepository<PasswordResetToken, Long> {
  Optional<PasswordResetToken> findByTokenHash(String tokenHash);
}
```

- [ ] **Step 5: Verify compilation**

Run: `cd "/home/omar/new project/backend" && ./mvnw -q compile`
Expected: `BUILD SUCCESS`.

- [ ] **Step 6: Commit**

```bash
cd "/home/omar/new project" && git add backend/src/main/java/com/enterprise/erp/modules/authentication
git commit -m "feat: add RefreshToken and PasswordResetToken JPA entities"
```

---

### Task 5: JwtProvider, JwtAuthenticationFilter, CorsConfig, SecurityConfig update

**Files:**
- Create: `backend/src/main/java/com/enterprise/erp/security/JwtProvider.java`
- Create: `backend/src/main/java/com/enterprise/erp/security/JwtAuthenticationFilter.java`
- Create: `backend/src/main/java/com/enterprise/erp/security/CorsConfig.java`
- Modify: `backend/src/main/java/com/enterprise/erp/config/SecurityConfig.java` (full file)

**Interfaces:**
- Consumes: `app.jwt.*`/`app.security.cors.*` properties from Task 1.
- Produces: `JwtProvider` with `String issueAccessToken(Long userId, String email, Set<String> roleNames)`, `Jws<Claims> parse(String token)` (throws `io.jsonwebtoken.JwtException` on invalid/expired), `long getAccessTokenTtlSeconds()` — consumed by Task 7 (`AuthService` issues tokens) and by `JwtAuthenticationFilter` itself (validates incoming tokens). `JwtAuthenticationFilter extends OncePerRequestFilter`, registered in the security chain, populates `SecurityContextHolder` from a valid `Authorization: Bearer <token>` header. `SecurityConfig` now has `@EnableMethodSecurity` and permits `/api/auth/register`, `/api/auth/login`, `/api/auth/refresh`, `/api/auth/logout`, `/api/auth/password-reset/**` plus the existing health/actuator paths; everything else requires authentication.

- [ ] **Step 1: Create `backend/src/main/java/com/enterprise/erp/security/JwtProvider.java`**

```java
package com.enterprise.erp.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.security.Keys;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Date;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import javax.crypto.SecretKey;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class JwtProvider {

  private static final String ROLES_CLAIM = "roles";

  private final SecretKey signingKey;
  private final long accessTokenTtlMinutes;

  public JwtProvider(
      @Value("${app.jwt.secret}") String secret,
      @Value("${app.jwt.access-token-ttl-minutes}") long accessTokenTtlMinutes) {
    this.signingKey = Keys.hmacShaKeyFor(secret.getBytes(StandardCharsets.UTF_8));
    this.accessTokenTtlMinutes = accessTokenTtlMinutes;
  }

  public String issueAccessToken(Long userId, String email, Set<String> roleNames) {
    Instant now = Instant.now();
    return Jwts.builder()
        .subject(String.valueOf(userId))
        .claim("email", email)
        .claim(ROLES_CLAIM, roleNames)
        .issuer("enterprise-erp")
        .issuedAt(Date.from(now))
        .expiration(Date.from(now.plus(accessTokenTtlMinutes, ChronoUnit.MINUTES)))
        .signWith(signingKey)
        .compact();
  }

  public Claims parse(String token) {
    return Jwts.parser().verifyWith(signingKey).build().parseSignedClaims(token).getPayload();
  }

  public long getAccessTokenTtlSeconds() {
    return accessTokenTtlMinutes * 60;
  }

  @SuppressWarnings("unchecked")
  public static List<String> rolesOf(Claims claims) {
    Object raw = claims.get(ROLES_CLAIM);
    if (raw instanceof List<?> list) {
      return list.stream().map(String::valueOf).collect(Collectors.toList());
    }
    return List.of();
  }
}
```

- [ ] **Step 2: Create `backend/src/main/java/com/enterprise/erp/security/JwtAuthenticationFilter.java`**

```java
package com.enterprise.erp.security;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.List;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

@Component
public class JwtAuthenticationFilter extends OncePerRequestFilter {

  private static final String BEARER_PREFIX = "Bearer ";

  private final JwtProvider jwtProvider;

  public JwtAuthenticationFilter(JwtProvider jwtProvider) {
    this.jwtProvider = jwtProvider;
  }

  @Override
  protected void doFilterInternal(
      HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
      throws ServletException, IOException {
    String header = request.getHeader("Authorization");
    if (header != null && header.startsWith(BEARER_PREFIX)) {
      String token = header.substring(BEARER_PREFIX.length());
      try {
        Claims claims = jwtProvider.parse(token);
        List<GrantedAuthority> authorities =
            JwtProvider.rolesOf(claims).stream()
                .map(role -> new SimpleGrantedAuthority("ROLE_" + role))
                .map(GrantedAuthority.class::cast)
                .toList();
        var authentication =
            new UsernamePasswordAuthenticationToken(claims.getSubject(), null, authorities);
        SecurityContextHolder.getContext().setAuthentication(authentication);
      } catch (JwtException | IllegalArgumentException ignored) {
        SecurityContextHolder.clearContext();
      }
    }
    filterChain.doFilter(request, response);
  }
}
```

- [ ] **Step 3: Create `backend/src/main/java/com/enterprise/erp/security/CorsConfig.java`**

```java
package com.enterprise.erp.security;

import java.util.List;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

@Configuration
public class CorsConfig {

  @Bean
  public CorsConfigurationSource corsConfigurationSource(
      @Value("${app.security.cors.allowed-origin}") String allowedOrigin) {
    CorsConfiguration configuration = new CorsConfiguration();
    configuration.setAllowedOrigins(List.of(allowedOrigin));
    configuration.setAllowedMethods(List.of("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"));
    configuration.setAllowedHeaders(List.of("Authorization", "Content-Type"));
    configuration.setAllowCredentials(true);

    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/**", configuration);
    return source;
  }
}
```

- [ ] **Step 4: Replace `backend/src/main/java/com/enterprise/erp/config/SecurityConfig.java`**

```java
package com.enterprise.erp.config;

import com.enterprise.erp.security.JwtAuthenticationFilter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.authentication.configuration.AuthenticationConfiguration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

@Configuration
@EnableMethodSecurity
public class SecurityConfig {

  @Bean
  public SecurityFilterChain securityFilterChain(
      HttpSecurity http, JwtAuthenticationFilter jwtAuthenticationFilter) throws Exception {
    http.csrf(csrf -> csrf.disable())
        .cors(cors -> {})
        .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .authorizeHttpRequests(
            authorize ->
                authorize
                    .requestMatchers(
                        "/api/health",
                        "/api/ready",
                        "/actuator/health",
                        "/actuator/info",
                        "/api/auth/register",
                        "/api/auth/login",
                        "/api/auth/refresh",
                        "/api/auth/logout",
                        "/api/auth/password-reset/**")
                    .permitAll()
                    .anyRequest()
                    .authenticated())
        .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

    return http.build();
  }

  @Bean
  public PasswordEncoder passwordEncoder() {
    return new BCryptPasswordEncoder();
  }

  @Bean
  public AuthenticationManager authenticationManager(
      AuthenticationConfiguration config, UserDetailsService userDetailsService, PasswordEncoder passwordEncoder)
      throws Exception {
    DaoAuthenticationProvider provider = new DaoAuthenticationProvider();
    provider.setUserDetailsService(userDetailsService);
    provider.setPasswordEncoder(passwordEncoder);
    return new org.springframework.security.authentication.ProviderManager(provider);
  }
}
```

Note: this references a `UserDetailsService` bean that does not exist yet — Task 7 provides it (`AuthService` implements `UserDetailsService` or a dedicated small class does). If Task 7 is not yet done, the app context will fail to start; that's expected and resolved by Task 7. This task's own verification (Step 5) only checks compilation, not context startup — the first live boot happens in Task 12.

- [ ] **Step 5: Verify compilation**

Run: `cd "/home/omar/new project/backend" && ./mvnw -q compile`
Expected: `BUILD SUCCESS`. (`AuthenticationManager`/`UserDetailsService` wiring is compile-safe even though no `UserDetailsService` bean exists yet — Spring only fails at runtime context startup, not at `javac` compile time, since `UserDetailsService` is an interface type reference here, not an instantiation.)

- [ ] **Step 6: Commit**

```bash
cd "/home/omar/new project" && git add backend/src/main/java/com/enterprise/erp/security backend/src/main/java/com/enterprise/erp/config/SecurityConfig.java
git commit -m "feat: add JWT provider, auth filter, CORS config, wire into SecurityConfig"
```

---

### Task 6: EmailSender port + LoggingEmailSender, GlobalExceptionHandler + ApiError

**Files:**
- Create: `backend/src/main/java/com/enterprise/erp/shared/mail/EmailSender.java`
- Create: `backend/src/main/java/com/enterprise/erp/shared/mail/LoggingEmailSender.java`
- Create: `backend/src/main/java/com/enterprise/erp/shared/web/ApiError.java`
- Create: `backend/src/main/java/com/enterprise/erp/shared/web/GlobalExceptionHandler.java`

**Interfaces:**
- Produces: `EmailSender` interface with `void sendPasswordResetEmail(String toEmail, String resetLink)`, implemented by `LoggingEmailSender` (the only bean, `@Component`) — consumed by Task 8 (`PasswordResetService`). `ApiError` record — consumed by `GlobalExceptionHandler`, which is a `@RestControllerAdvice` that Task 9's `AuthController` relies on for consistent error responses (no direct code dependency, just shared behavior).

- [ ] **Step 1: Create `backend/src/main/java/com/enterprise/erp/shared/mail/EmailSender.java`**

```java
package com.enterprise.erp.shared.mail;

public interface EmailSender {
  void sendPasswordResetEmail(String toEmail, String resetLink);
}
```

- [ ] **Step 2: Create `backend/src/main/java/com/enterprise/erp/shared/mail/LoggingEmailSender.java`**

```java
package com.enterprise.erp.shared.mail;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class LoggingEmailSender implements EmailSender {

  private static final Logger log = LoggerFactory.getLogger(LoggingEmailSender.class);

  @Override
  public void sendPasswordResetEmail(String toEmail, String resetLink) {
    log.info("Password reset requested for {} — link: {}", toEmail, resetLink);
  }
}
```

- [ ] **Step 3: Create `backend/src/main/java/com/enterprise/erp/shared/web/ApiError.java`**

```java
package com.enterprise.erp.shared.web;

import java.time.Instant;

public record ApiError(String error, String message, String timestamp) {
  public static ApiError of(String error, String message) {
    return new ApiError(error, message, Instant.now().toString());
  }
}
```

- [ ] **Step 4: Create `backend/src/main/java/com/enterprise/erp/shared/web/GlobalExceptionHandler.java`**

```java
package com.enterprise.erp.shared.web;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class GlobalExceptionHandler {

  @ExceptionHandler(MethodArgumentNotValidException.class)
  public ResponseEntity<ApiError> handleValidation(MethodArgumentNotValidException ex) {
    String message =
        ex.getBindingResult().getFieldErrors().stream()
            .findFirst()
            .map(e -> e.getField() + ": " + e.getDefaultMessage())
            .orElse("Validation failed");
    return ResponseEntity.badRequest().body(ApiError.of("VALIDATION_ERROR", message));
  }

  @ExceptionHandler(BadCredentialsException.class)
  public ResponseEntity<ApiError> handleBadCredentials(BadCredentialsException ex) {
    return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
        .body(ApiError.of("INVALID_CREDENTIALS", "Email or password is incorrect"));
  }

  @ExceptionHandler(DuplicateEmailException.class)
  public ResponseEntity<ApiError> handleDuplicateEmail(DuplicateEmailException ex) {
    return ResponseEntity.status(HttpStatus.CONFLICT)
        .body(ApiError.of("EMAIL_ALREADY_REGISTERED", ex.getMessage()));
  }

  @ExceptionHandler(InvalidTokenException.class)
  public ResponseEntity<ApiError> handleInvalidToken(InvalidTokenException ex) {
    return ResponseEntity.status(HttpStatus.UNAUTHORIZED)
        .body(ApiError.of("INVALID_TOKEN", ex.getMessage()));
  }
}
```

Note: `DuplicateEmailException` and `InvalidTokenException` are created in Task 7 (`com.enterprise.erp.modules.authentication` package, both extending `RuntimeException`) — this handler references them by simple name via import; add the imports (`com.enterprise.erp.modules.authentication.DuplicateEmailException`, `com.enterprise.erp.modules.authentication.InvalidTokenException`) when Step 4 is written. If Task 6 is executed before Task 7 (per this plan's ordering it is), compilation of this file will fail until Task 7 lands — that's expected; both tasks are needed together for a green build, and Task 6's own compile-verify step below will fail for that reason alone. Do not treat that as a defect in Task 6: verify with `git stash`-free reasoning — actually, to keep each task independently green, add the two exception classes to `com.enterprise.erp.modules.authentication` in THIS task instead, and have Task 7 reuse them without recreating them (updated below).

- [ ] **Step 4b: Also create the two exception classes referenced above, in this task, so Task 6 compiles standalone**

`backend/src/main/java/com/enterprise/erp/modules/authentication/DuplicateEmailException.java`:

```java
package com.enterprise.erp.modules.authentication;

public class DuplicateEmailException extends RuntimeException {
  public DuplicateEmailException(String message) {
    super(message);
  }
}
```

`backend/src/main/java/com/enterprise/erp/modules/authentication/InvalidTokenException.java`:

```java
package com.enterprise.erp.modules.authentication;

public class InvalidTokenException extends RuntimeException {
  public InvalidTokenException(String message) {
    super(message);
  }
}
```

And add these two imports to `GlobalExceptionHandler.java` from Step 4, right after the `org.springframework.security.authentication.BadCredentialsException` import:

```java
import com.enterprise.erp.modules.authentication.DuplicateEmailException;
import com.enterprise.erp.modules.authentication.InvalidTokenException;
```

- [ ] **Step 5: Verify compilation**

Run: `cd "/home/omar/new project/backend" && ./mvnw -q compile`
Expected: `BUILD SUCCESS`.

- [ ] **Step 6: Commit**

```bash
cd "/home/omar/new project" && git add backend/src/main/java/com/enterprise/erp/shared backend/src/main/java/com/enterprise/erp/modules/authentication/DuplicateEmailException.java backend/src/main/java/com/enterprise/erp/modules/authentication/InvalidTokenException.java
git commit -m "feat: add EmailSender port, LoggingEmailSender, global exception handling"
```

---

### Task 7: DTOs, UserDetailsService, AuthService (register/login/refresh/logout)

**Files:**
- Create: `backend/src/main/java/com/enterprise/erp/modules/authentication/RegisterRequest.java`
- Create: `backend/src/main/java/com/enterprise/erp/modules/authentication/LoginRequest.java`
- Create: `backend/src/main/java/com/enterprise/erp/modules/authentication/AuthResult.java`
- Create: `backend/src/main/java/com/enterprise/erp/modules/authentication/UserSummary.java`
- Create: `backend/src/main/java/com/enterprise/erp/modules/authentication/AppUserDetailsService.java`
- Create: `backend/src/main/java/com/enterprise/erp/modules/authentication/AuthService.java`

**Interfaces:**
- Consumes: `User`/`UserRepository` (Task 3), `Role`/`RoleRepository` (Task 3), `RefreshToken`/`RefreshTokenRepository` (Task 4), `JwtProvider` (Task 5), `DuplicateEmailException`/`InvalidTokenException` (Task 6), `PasswordEncoder` bean (already in `SecurityConfig`).
- Produces: `AppUserDetailsService implements UserDetailsService` — the bean `SecurityConfig`'s `authenticationManager` needs (Task 5 compiles against the interface; this task provides the actual bean, resolving Task 5's noted runtime gap). `AuthService` with `AuthResult register(RegisterRequest)`, `AuthResult login(LoginRequest)`, `AuthResult refresh(String rawRefreshToken)`, `void logout(String rawRefreshToken)` — consumed by Task 9 (`AuthController`). `AuthResult` (record: `String accessToken, long expiresInSeconds, String rawRefreshToken, Instant refreshExpiresAt, UserSummary user`) and `UserSummary` (record: `Long id, String email, String fullName, List<String> roles`) — the controller reads `rawRefreshToken`/`refreshExpiresAt` to set the cookie and returns the rest as JSON.

- [ ] **Step 1: Create `backend/src/main/java/com/enterprise/erp/modules/authentication/RegisterRequest.java`**

```java
package com.enterprise.erp.modules.authentication;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RegisterRequest(
    @Email @NotBlank String email,
    @NotBlank @Size(min = 8, max = 100) String password,
    @NotBlank @Size(max = 255) String fullName) {}
```

- [ ] **Step 2: Create `backend/src/main/java/com/enterprise/erp/modules/authentication/LoginRequest.java`**

```java
package com.enterprise.erp.modules.authentication;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record LoginRequest(@Email @NotBlank String email, @NotBlank String password) {}
```

- [ ] **Step 3: Create `backend/src/main/java/com/enterprise/erp/modules/authentication/UserSummary.java`**

```java
package com.enterprise.erp.modules.authentication;

import java.util.List;

public record UserSummary(Long id, String email, String fullName, List<String> roles) {}
```

- [ ] **Step 4: Create `backend/src/main/java/com/enterprise/erp/modules/authentication/AuthResult.java`**

```java
package com.enterprise.erp.modules.authentication;

import java.time.Instant;

public record AuthResult(
    String accessToken,
    long expiresInSeconds,
    String rawRefreshToken,
    Instant refreshExpiresAt,
    UserSummary user) {}
```

- [ ] **Step 5: Create `backend/src/main/java/com/enterprise/erp/modules/authentication/AppUserDetailsService.java`**

```java
package com.enterprise.erp.modules.authentication;

import com.enterprise.erp.modules.users.User;
import com.enterprise.erp.modules.users.UserRepository;
import java.util.List;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Service
public class AppUserDetailsService implements UserDetailsService {

  private final UserRepository userRepository;

  public AppUserDetailsService(UserRepository userRepository) {
    this.userRepository = userRepository;
  }

  @Override
  public UserDetails loadUserByUsername(String email) throws UsernameNotFoundException {
    User user =
        userRepository
            .findByEmail(email)
            .orElseThrow(() -> new UsernameNotFoundException("No user with email " + email));
    List<String> authorities = user.getRoles().stream().map(r -> "ROLE_" + r.getName()).toList();
    return org.springframework.security.core.userdetails.User.builder()
        .username(user.getEmail())
        .password(user.getPasswordHash())
        .authorities(authorities.toArray(new String[0]))
        .disabled(!user.isActive())
        .build();
  }
}
```

- [ ] **Step 6: Create `backend/src/main/java/com/enterprise/erp/modules/authentication/AuthService.java`**

```java
package com.enterprise.erp.modules.authentication;

import com.enterprise.erp.modules.roles.Role;
import com.enterprise.erp.modules.roles.RoleRepository;
import com.enterprise.erp.modules.users.User;
import com.enterprise.erp.modules.users.UserRepository;
import com.enterprise.erp.security.JwtProvider;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {

  private final UserRepository userRepository;
  private final RoleRepository roleRepository;
  private final RefreshTokenRepository refreshTokenRepository;
  private final PasswordEncoder passwordEncoder;
  private final AuthenticationManager authenticationManager;
  private final JwtProvider jwtProvider;
  private final long refreshTokenTtlDays;
  private final SecureRandom secureRandom = new SecureRandom();

  public AuthService(
      UserRepository userRepository,
      RoleRepository roleRepository,
      RefreshTokenRepository refreshTokenRepository,
      PasswordEncoder passwordEncoder,
      AuthenticationManager authenticationManager,
      JwtProvider jwtProvider,
      @Value("${app.jwt.refresh-token-ttl-days}") long refreshTokenTtlDays) {
    this.userRepository = userRepository;
    this.roleRepository = roleRepository;
    this.refreshTokenRepository = refreshTokenRepository;
    this.passwordEncoder = passwordEncoder;
    this.authenticationManager = authenticationManager;
    this.jwtProvider = jwtProvider;
    this.refreshTokenTtlDays = refreshTokenTtlDays;
  }

  @Transactional
  public AuthResult register(RegisterRequest request) {
    if (userRepository.existsByEmail(request.email())) {
      throw new DuplicateEmailException("Email is already registered");
    }
    boolean isFirstUser = userRepository.count() == 0;

    User user =
        new User(request.email(), passwordEncoder.encode(request.password()), request.fullName());
    Set<Role> roles = new HashSet<>();
    roleRepository.findByName("USER").ifPresent(roles::add);
    if (isFirstUser) {
      roleRepository.findByName("SUPER_ADMIN").ifPresent(roles::add);
    }
    user.getRoles().addAll(roles);
    user = userRepository.save(user);

    return issueTokens(user);
  }

  @Transactional
  public AuthResult login(LoginRequest request) {
    try {
      authenticationManager.authenticate(
          new UsernamePasswordAuthenticationToken(request.email(), request.password()));
    } catch (org.springframework.security.core.AuthenticationException ex) {
      throw new BadCredentialsException("Invalid email or password");
    }
    User user =
        userRepository
            .findByEmail(request.email())
            .orElseThrow(() -> new BadCredentialsException("Invalid email or password"));
    return issueTokens(user);
  }

  @Transactional
  public AuthResult refresh(String rawRefreshToken) {
    String hash = hash(rawRefreshToken);
    RefreshToken existing =
        refreshTokenRepository
            .findByTokenHash(hash)
            .orElseThrow(() -> new InvalidTokenException("Refresh token not recognized"));

    if (existing.getReplacedByTokenId() != null) {
      // Reuse of an already-rotated-out token — treat as compromise, revoke the whole chain.
      revokeAllActiveTokensForUser(existing.getUser().getId());
      throw new InvalidTokenException("Refresh token reuse detected — all sessions revoked");
    }
    if (!existing.isActive()) {
      throw new InvalidTokenException("Refresh token expired or revoked");
    }

    existing.revoke();
    refreshTokenRepository.save(existing);

    User user = existing.getUser();
    AuthResult result = issueTokens(user);

    RefreshToken newToken =
        refreshTokenRepository.findByTokenHash(hash(result.rawRefreshToken())).orElseThrow();
    existing.setReplacedByTokenId(newToken.getId());
    refreshTokenRepository.save(existing);

    return result;
  }

  @Transactional
  public void logout(String rawRefreshToken) {
    refreshTokenRepository.findByTokenHash(hash(rawRefreshToken)).ifPresent(RefreshToken::revoke);
  }

  @Transactional
  void revokeAllActiveTokensForUser(Long userId) {
    List<RefreshToken> active = refreshTokenRepository.findAllByUserIdAndRevokedAtIsNull(userId);
    active.forEach(RefreshToken::revoke);
    refreshTokenRepository.saveAll(active);
  }

  private AuthResult issueTokens(User user) {
    List<String> roleNames = user.getRoles().stream().map(Role::getName).toList();
    String accessToken =
        jwtProvider.issueAccessToken(user.getId(), user.getEmail(), Set.copyOf(roleNames));

    String rawRefresh = generateOpaqueToken();
    Instant expiresAt = Instant.now().plus(refreshTokenTtlDays, ChronoUnit.DAYS);
    refreshTokenRepository.save(new RefreshToken(user, hash(rawRefresh), expiresAt));

    UserSummary summary = new UserSummary(user.getId(), user.getEmail(), user.getFullName(), roleNames);
    return new AuthResult(
        accessToken, jwtProvider.getAccessTokenTtlSeconds(), rawRefresh, expiresAt, summary);
  }

  private String generateOpaqueToken() {
    byte[] bytes = new byte[32];
    secureRandom.nextBytes(bytes);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
  }

  private String hash(String raw) {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      byte[] hashed = digest.digest(raw.getBytes(java.nio.charset.StandardCharsets.UTF_8));
      return Base64.getUrlEncoder().withoutPadding().encodeToString(hashed);
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException("SHA-256 not available", e);
    }
  }
}
```

- [ ] **Step 7: Verify compilation**

Run: `cd "/home/omar/new project/backend" && ./mvnw -q compile`
Expected: `BUILD SUCCESS`.

- [ ] **Step 8: Commit**

```bash
cd "/home/omar/new project" && git add backend/src/main/java/com/enterprise/erp/modules/authentication
git commit -m "feat: add AuthService with register/login/refresh-rotation/logout"
```

---

### Task 8: PasswordResetService

**Files:**
- Create: `backend/src/main/java/com/enterprise/erp/modules/authentication/PasswordResetRequest.java`
- Create: `backend/src/main/java/com/enterprise/erp/modules/authentication/PasswordResetConfirm.java`
- Create: `backend/src/main/java/com/enterprise/erp/modules/authentication/PasswordResetService.java`

**Interfaces:**
- Consumes: `UserRepository` (Task 3), `PasswordResetToken`/`PasswordResetTokenRepository` (Task 4), `RefreshTokenRepository` (Task 4, to revoke sessions), `EmailSender` (Task 6), `InvalidTokenException` (Task 6), `PasswordEncoder` bean.
- Produces: `PasswordResetService` with `void requestReset(String email)` (always returns normally, no exception even if email unknown — prevents enumeration) and `void confirmReset(PasswordResetConfirm request)` (throws `InvalidTokenException` if invalid/expired/used) — consumed by Task 9 (`AuthController`).

- [ ] **Step 1: Create `backend/src/main/java/com/enterprise/erp/modules/authentication/PasswordResetRequest.java`**

```java
package com.enterprise.erp.modules.authentication;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record PasswordResetRequest(@Email @NotBlank String email) {}
```

- [ ] **Step 2: Create `backend/src/main/java/com/enterprise/erp/modules/authentication/PasswordResetConfirm.java`**

```java
package com.enterprise.erp.modules.authentication;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record PasswordResetConfirm(
    @NotBlank String token, @NotBlank @Size(min = 8, max = 100) String newPassword) {}
```

- [ ] **Step 3: Create `backend/src/main/java/com/enterprise/erp/modules/authentication/PasswordResetService.java`**

```java
package com.enterprise.erp.modules.authentication;

import com.enterprise.erp.modules.users.User;
import com.enterprise.erp.modules.users.UserRepository;
import com.enterprise.erp.shared.mail.EmailSender;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PasswordResetService {

  private static final Logger log = LoggerFactory.getLogger(PasswordResetService.class);
  private static final long RESET_TOKEN_TTL_MINUTES = 60;

  private final UserRepository userRepository;
  private final PasswordResetTokenRepository resetTokenRepository;
  private final com.enterprise.erp.modules.authentication.RefreshTokenRepository refreshTokenRepository;
  private final PasswordEncoder passwordEncoder;
  private final EmailSender emailSender;
  private final String frontendResetUrlBase;
  private final SecureRandom secureRandom = new SecureRandom();

  public PasswordResetService(
      UserRepository userRepository,
      PasswordResetTokenRepository resetTokenRepository,
      RefreshTokenRepository refreshTokenRepository,
      PasswordEncoder passwordEncoder,
      EmailSender emailSender,
      @Value("${app.security.cors.allowed-origin}") String frontendResetUrlBase) {
    this.userRepository = userRepository;
    this.resetTokenRepository = resetTokenRepository;
    this.refreshTokenRepository = refreshTokenRepository;
    this.passwordEncoder = passwordEncoder;
    this.emailSender = emailSender;
    this.frontendResetUrlBase = frontendResetUrlBase;
  }

  @Transactional
  public void requestReset(String email) {
    userRepository
        .findByEmail(email)
        .ifPresentOrElse(
            user -> {
              String raw = generateOpaqueToken();
              Instant expiresAt = Instant.now().plus(RESET_TOKEN_TTL_MINUTES, ChronoUnit.MINUTES);
              resetTokenRepository.save(new PasswordResetToken(user, hash(raw), expiresAt));
              String link = frontendResetUrlBase + "/reset-password?token=" + raw;
              emailSender.sendPasswordResetEmail(user.getEmail(), link);
            },
            () -> log.info("Password reset requested for unknown email {}", email));
  }

  @Transactional
  public void confirmReset(PasswordResetConfirm request) {
    PasswordResetToken token =
        resetTokenRepository
            .findByTokenHash(hash(request.token()))
            .orElseThrow(() -> new InvalidTokenException("Reset token is invalid"));
    if (!token.isValid()) {
      throw new InvalidTokenException("Reset token is expired or already used");
    }

    User user = token.getUser();
    user.setPasswordHash(passwordEncoder.encode(request.newPassword()));
    userRepository.save(user);

    token.markUsed();
    resetTokenRepository.save(token);

    List<com.enterprise.erp.modules.authentication.RefreshToken> active =
        refreshTokenRepository.findAllByUserIdAndRevokedAtIsNull(user.getId());
    active.forEach(com.enterprise.erp.modules.authentication.RefreshToken::revoke);
    refreshTokenRepository.saveAll(active);
  }

  private String generateOpaqueToken() {
    byte[] bytes = new byte[32];
    secureRandom.nextBytes(bytes);
    return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
  }

  private String hash(String raw) {
    try {
      MessageDigest digest = MessageDigest.getInstance("SHA-256");
      byte[] hashed = digest.digest(raw.getBytes(java.nio.charset.StandardCharsets.UTF_8));
      return Base64.getUrlEncoder().withoutPadding().encodeToString(hashed);
    } catch (NoSuchAlgorithmException e) {
      throw new IllegalStateException("SHA-256 not available", e);
    }
  }
}
```

Note: `frontendResetUrlBase` reuses `app.security.cors.allowed-origin` (the Vite dev origin) as a pragmatic foundation-phase stand-in for a dedicated `app.frontend.base-url` property — both point at the same place in dev. Acceptable for this scope; a dedicated property is trivial future work if the two ever need to diverge (e.g. prod CORS origin differing from the reset-link host).

- [ ] **Step 4: Verify compilation**

Run: `cd "/home/omar/new project/backend" && ./mvnw -q compile`
Expected: `BUILD SUCCESS`.

- [ ] **Step 5: Commit**

```bash
cd "/home/omar/new project" && git add backend/src/main/java/com/enterprise/erp/modules/authentication
git commit -m "feat: add PasswordResetService with enumeration-safe request + session revocation on confirm"
```

---

### Task 9: AuthController (register/login/refresh/logout/password-reset + protected sample endpoint)

**Files:**
- Create: `backend/src/main/java/com/enterprise/erp/modules/authentication/AuthController.java`
- Create: `backend/src/main/java/com/enterprise/erp/modules/authentication/AccessTokenResponse.java`
- Create: `backend/src/main/java/com/enterprise/erp/modules/users/UserListController.java`

**Interfaces:**
- Consumes: `AuthService` (Task 7), `PasswordResetService` (Task 8), `RegisterRequest`/`LoginRequest`/`PasswordResetRequest`/`PasswordResetConfirm`/`AuthResult` (Tasks 7–8), `UserRepository` (Task 3).
- Produces: HTTP endpoints `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/refresh`, `POST /api/auth/logout`, `POST /api/auth/password-reset/request`, `POST /api/auth/password-reset/confirm`, and `GET /api/auth/users` (`@PreAuthorize("hasRole('SUPER_ADMIN')")`, proves RBAC enforcement works end-to-end) — the frontend (Task 13+) calls these exactly.

- [ ] **Step 1: Create `backend/src/main/java/com/enterprise/erp/modules/authentication/AccessTokenResponse.java`**

```java
package com.enterprise.erp.modules.authentication;

public record AccessTokenResponse(String accessToken, long expiresInSeconds, UserSummary user) {
  public static AccessTokenResponse from(AuthResult result) {
    return new AccessTokenResponse(result.accessToken(), result.expiresInSeconds(), result.user());
  }
}
```

- [ ] **Step 2: Create `backend/src/main/java/com/enterprise/erp/modules/authentication/AuthController.java`**

```java
package com.enterprise.erp.modules.authentication;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import java.time.Duration;
import java.time.Instant;
import org.springframework.http.ResponseCookie;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

  private static final String REFRESH_COOKIE_NAME = "refreshToken";
  private static final String REFRESH_COOKIE_PATH = "/api/auth";

  private final AuthService authService;
  private final PasswordResetService passwordResetService;

  public AuthController(AuthService authService, PasswordResetService passwordResetService) {
    this.authService = authService;
    this.passwordResetService = passwordResetService;
  }

  @PostMapping("/register")
  public ResponseEntity<AccessTokenResponse> register(@Valid @RequestBody RegisterRequest request) {
    AuthResult result = authService.register(request);
    return withRefreshCookie(result);
  }

  @PostMapping("/login")
  public ResponseEntity<AccessTokenResponse> login(@Valid @RequestBody LoginRequest request) {
    AuthResult result = authService.login(request);
    return withRefreshCookie(result);
  }

  @PostMapping("/refresh")
  public ResponseEntity<AccessTokenResponse> refresh(HttpServletRequest request) {
    String raw = readRefreshCookie(request);
    if (raw == null) {
      throw new InvalidTokenException("No refresh token present");
    }
    AuthResult result = authService.refresh(raw);
    return withRefreshCookie(result);
  }

  @PostMapping("/logout")
  public ResponseEntity<Void> logout(HttpServletRequest request, HttpServletResponse response) {
    String raw = readRefreshCookie(request);
    if (raw != null) {
      authService.logout(raw);
    }
    ResponseCookie expired =
        ResponseCookie.from(REFRESH_COOKIE_NAME, "")
            .httpOnly(true)
            .sameSite("Strict")
            .path(REFRESH_COOKIE_PATH)
            .maxAge(0)
            .build();
    response.addHeader("Set-Cookie", expired.toString());
    return ResponseEntity.noContent().build();
  }

  @PostMapping("/password-reset/request")
  public ResponseEntity<Void> requestPasswordReset(@Valid @RequestBody PasswordResetRequest request) {
    passwordResetService.requestReset(request.email());
    return ResponseEntity.accepted().build();
  }

  @PostMapping("/password-reset/confirm")
  public ResponseEntity<Void> confirmPasswordReset(@Valid @RequestBody PasswordResetConfirm request) {
    passwordResetService.confirmReset(request);
    return ResponseEntity.noContent().build();
  }

  private ResponseEntity<AccessTokenResponse> withRefreshCookie(AuthResult result) {
    Duration maxAge = Duration.between(Instant.now(), result.refreshExpiresAt());
    ResponseCookie cookie =
        ResponseCookie.from(REFRESH_COOKIE_NAME, result.rawRefreshToken())
            .httpOnly(true)
            .sameSite("Strict")
            .path(REFRESH_COOKIE_PATH)
            .maxAge(maxAge)
            .build();
    return ResponseEntity.ok()
        .header("Set-Cookie", cookie.toString())
        .body(AccessTokenResponse.from(result));
  }

  private String readRefreshCookie(HttpServletRequest request) {
    if (request.getCookies() == null) {
      return null;
    }
    for (Cookie cookie : request.getCookies()) {
      if (REFRESH_COOKIE_NAME.equals(cookie.getName())) {
        return cookie.getValue();
      }
    }
    return null;
  }
}
```

- [ ] **Step 3: Create `backend/src/main/java/com/enterprise/erp/modules/users/UserListController.java`** (the protected sample endpoint proving RBAC enforcement)

```java
package com.enterprise.erp.modules.users;

import java.util.List;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth/users")
public class UserListController {

  private final UserRepository userRepository;

  public UserListController(UserRepository userRepository) {
    this.userRepository = userRepository;
  }

  @GetMapping
  @PreAuthorize("hasRole('SUPER_ADMIN')")
  public List<UserSummaryView> list() {
    return userRepository.findAll().stream()
        .map(
            u ->
                new UserSummaryView(
                    u.getId(), u.getEmail(), u.getFullName(), u.getRoles().stream().map(r -> r.getName()).toList()))
        .toList();
  }

  public record UserSummaryView(Long id, String email, String fullName, List<String> roles) {}
}
```

- [ ] **Step 4: Verify compilation**

Run: `cd "/home/omar/new project/backend" && ./mvnw -q compile`
Expected: `BUILD SUCCESS`. All wiring from Tasks 1–9 is now complete — this is the first point where the full app context (SecurityConfig depending on JwtAuthenticationFilter depending on JwtProvider; AuthenticationManager depending on AppUserDetailsService; AuthController depending on AuthService/PasswordResetService) is structurally complete. Actual context startup is verified live in Task 12.

- [ ] **Step 5: Commit**

```bash
cd "/home/omar/new project" && git add backend/src/main/java/com/enterprise/erp/modules/authentication/AuthController.java backend/src/main/java/com/enterprise/erp/modules/authentication/AccessTokenResponse.java backend/src/main/java/com/enterprise/erp/modules/users/UserListController.java
git commit -m "feat: add AuthController endpoints and RBAC-protected user list sample endpoint"
```

---

### Task 10: Unit tests — JwtProvider, AuthService, PasswordResetService

**Files:**
- Create: `backend/src/test/java/com/enterprise/erp/security/JwtProviderTest.java`
- Create: `backend/src/test/java/com/enterprise/erp/modules/authentication/AuthServiceTest.java`
- Create: `backend/src/test/java/com/enterprise/erp/modules/authentication/PasswordResetServiceTest.java`

**Interfaces:**
- Consumes: `JwtProvider` (Task 5), `AuthService` (Task 7), `PasswordResetService` (Task 8), and all their dependencies, mocked with Mockito where they're not the class under test.

This is this project's first test suite — establishes the pattern (JUnit 5 `@Test`, Mockito `@Mock`/`@InjectMocks` or manual construction, AssertJ-style-via-JUnit assertions since AssertJ is not yet a dependency — use plain `org.junit.jupiter.api.Assertions` to avoid adding a new test dependency for this task; adding AssertJ is reasonable future work but not required here).

- [ ] **Step 1: Create `backend/src/test/java/com/enterprise/erp/security/JwtProviderTest.java`**

```java
package com.enterprise.erp.security;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import java.util.Set;
import org.junit.jupiter.api.Test;

class JwtProviderTest {

  private final JwtProvider provider =
      new JwtProvider("test-secret-key-at-least-32-characters-long", 15);

  @Test
  void issuesTokenWithSubjectRolesAndEmail() {
    String token = provider.issueAccessToken(42L, "user@example.com", Set.of("USER", "SUPER_ADMIN"));

    Claims claims = provider.parse(token);

    assertEquals("42", claims.getSubject());
    assertEquals("user@example.com", claims.get("email"));
    assertTrue(JwtProvider.rolesOf(claims).containsAll(Set.of("USER", "SUPER_ADMIN")));
  }

  @Test
  void rejectsTamperedToken() {
    String token = provider.issueAccessToken(1L, "a@b.com", Set.of("USER"));
    String tampered = token.substring(0, token.length() - 2) + "xx";

    assertThrows(JwtException.class, () -> provider.parse(tampered));
  }

  @Test
  void rejectsTokenSignedWithDifferentSecret() {
    JwtProvider other = new JwtProvider("different-secret-key-at-least-32-characters", 15);
    String token = other.issueAccessToken(1L, "a@b.com", Set.of("USER"));

    assertThrows(JwtException.class, () -> provider.parse(token));
  }

  @Test
  void accessTokenTtlSecondsMatchesMinutesConfig() {
    assertEquals(15 * 60, provider.getAccessTokenTtlSeconds());
  }
}
```

- [ ] **Step 2: Create `backend/src/test/java/com/enterprise/erp/modules/authentication/AuthServiceTest.java`**

```java
package com.enterprise.erp.modules.authentication;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.enterprise.erp.modules.roles.Role;
import com.enterprise.erp.modules.roles.RoleRepository;
import com.enterprise.erp.modules.users.User;
import com.enterprise.erp.modules.users.UserRepository;
import com.enterprise.erp.security.JwtProvider;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.crypto.password.PasswordEncoder;

class AuthServiceTest {

  private UserRepository userRepository;
  private RoleRepository roleRepository;
  private RefreshTokenRepository refreshTokenRepository;
  private PasswordEncoder passwordEncoder;
  private AuthenticationManager authenticationManager;
  private JwtProvider jwtProvider;
  private AuthService authService;

  @BeforeEach
  void setUp() {
    userRepository = mock(UserRepository.class);
    roleRepository = mock(RoleRepository.class);
    refreshTokenRepository = mock(RefreshTokenRepository.class);
    passwordEncoder = mock(PasswordEncoder.class);
    authenticationManager = mock(AuthenticationManager.class);
    jwtProvider = mock(JwtProvider.class);
    authService =
        new AuthService(
            userRepository,
            roleRepository,
            refreshTokenRepository,
            passwordEncoder,
            authenticationManager,
            jwtProvider,
            7);

    when(passwordEncoder.encode(any())).thenReturn("hashed");
    when(jwtProvider.issueAccessToken(any(), any(), any())).thenReturn("access-token");
    when(jwtProvider.getAccessTokenTtlSeconds()).thenReturn(900L);
    when(userRepository.save(any(User.class))).thenAnswer(inv -> inv.getArgument(0));
  }

  @Test
  void firstRegisteredUserGetsSuperAdminAndUserRoles() {
    when(userRepository.existsByEmail(any())).thenReturn(false);
    when(userRepository.count()).thenReturn(0L);
    Role userRole = new Role("USER", "");
    Role adminRole = new Role("SUPER_ADMIN", "");
    when(roleRepository.findByName("USER")).thenReturn(Optional.of(userRole));
    when(roleRepository.findByName("SUPER_ADMIN")).thenReturn(Optional.of(adminRole));

    AuthResult result = authService.register(new RegisterRequest("a@b.com", "password123", "A B"));

    assertTrue(result.user().roles().containsAll(List.of("USER", "SUPER_ADMIN")));
  }

  @Test
  void secondRegisteredUserGetsOnlyUserRole() {
    when(userRepository.existsByEmail(any())).thenReturn(false);
    when(userRepository.count()).thenReturn(1L);
    Role userRole = new Role("USER", "");
    when(roleRepository.findByName("USER")).thenReturn(Optional.of(userRole));

    AuthResult result = authService.register(new RegisterRequest("b@b.com", "password123", "B B"));

    assertEquals(List.of("USER"), result.user().roles());
  }

  @Test
  void registerRejectsDuplicateEmail() {
    when(userRepository.existsByEmail(any())).thenReturn(true);

    assertThrows(
        DuplicateEmailException.class,
        () -> authService.register(new RegisterRequest("dup@b.com", "password123", "D D")));
  }

  @Test
  void loginRejectsBadCredentials() {
    when(authenticationManager.authenticate(any()))
        .thenThrow(new org.springframework.security.authentication.BadCredentialsException("bad"));

    assertThrows(
        BadCredentialsException.class,
        () -> authService.login(new LoginRequest("a@b.com", "wrong")));
  }

  @Test
  void refreshRejectsUnknownToken() {
    when(refreshTokenRepository.findByTokenHash(any())).thenReturn(Optional.empty());

    assertThrows(InvalidTokenException.class, () -> authService.refresh("unknown-token"));
  }

  @Test
  void refreshDetectsReuseOfRotatedTokenAndRevokesChain() {
    User user = new User("a@b.com", "hashed", "A B");
    setId(user, 5L);
    RefreshToken existing = new RefreshToken(user, "hash", Instant.now().plusSeconds(3600));
    existing.setReplacedByTokenId(999L);
    when(refreshTokenRepository.findByTokenHash(any())).thenReturn(Optional.of(existing));
    when(refreshTokenRepository.findAllByUserIdAndRevokedAtIsNull(5L)).thenReturn(List.of(existing));

    assertThrows(InvalidTokenException.class, () -> authService.refresh("raw-token"));
    verify(refreshTokenRepository, times(1)).saveAll(any());
  }

  private void setId(User user, Long id) {
    try {
      var field = User.class.getDeclaredField("id");
      field.setAccessible(true);
      field.set(user, id);
    } catch (ReflectiveOperationException e) {
      throw new RuntimeException(e);
    }
  }
}
```

- [ ] **Step 3: Create `backend/src/test/java/com/enterprise/erp/modules/authentication/PasswordResetServiceTest.java`**

```java
package com.enterprise.erp.modules.authentication;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.enterprise.erp.modules.users.User;
import com.enterprise.erp.modules.users.UserRepository;
import com.enterprise.erp.shared.mail.EmailSender;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.password.PasswordEncoder;

class PasswordResetServiceTest {

  private UserRepository userRepository;
  private PasswordResetTokenRepository resetTokenRepository;
  private RefreshTokenRepository refreshTokenRepository;
  private PasswordEncoder passwordEncoder;
  private EmailSender emailSender;
  private PasswordResetService service;

  @BeforeEach
  void setUp() {
    userRepository = mock(UserRepository.class);
    resetTokenRepository = mock(PasswordResetTokenRepository.class);
    refreshTokenRepository = mock(RefreshTokenRepository.class);
    passwordEncoder = mock(PasswordEncoder.class);
    emailSender = mock(EmailSender.class);
    service =
        new PasswordResetService(
            userRepository,
            resetTokenRepository,
            refreshTokenRepository,
            passwordEncoder,
            emailSender,
            "http://localhost:5173");
  }

  @Test
  void requestResetDoesNothingObservableForUnknownEmail() {
    when(userRepository.findByEmail("ghost@b.com")).thenReturn(Optional.empty());

    service.requestReset("ghost@b.com");

    verify(emailSender, times(0)).sendPasswordResetEmail(anyString(), anyString());
  }

  @Test
  void requestResetSendsEmailForKnownUser() {
    User user = new User("a@b.com", "hashed", "A B");
    when(userRepository.findByEmail("a@b.com")).thenReturn(Optional.of(user));

    service.requestReset("a@b.com");

    verify(emailSender, times(1)).sendPasswordResetEmail(org.mockito.ArgumentMatchers.eq("a@b.com"), anyString());
  }

  @Test
  void confirmRejectsUnknownToken() {
    when(resetTokenRepository.findByTokenHash(any())).thenReturn(Optional.empty());

    assertThrows(
        InvalidTokenException.class,
        () -> service.confirmReset(new PasswordResetConfirm("bad-token", "newpassword123")));
  }

  @Test
  void confirmRejectsExpiredToken() {
    User user = new User("a@b.com", "hashed", "A B");
    PasswordResetToken expired = new PasswordResetToken(user, "hash", Instant.now().minusSeconds(60));
    when(resetTokenRepository.findByTokenHash(any())).thenReturn(Optional.of(expired));

    assertThrows(
        InvalidTokenException.class,
        () -> service.confirmReset(new PasswordResetConfirm("token", "newpassword123")));
  }

  @Test
  void confirmSuccessRevokesActiveRefreshTokens() {
    User user = new User("a@b.com", "hashed", "A B");
    PasswordResetToken valid = new PasswordResetToken(user, "hash", Instant.now().plusSeconds(3600));
    when(resetTokenRepository.findByTokenHash(any())).thenReturn(Optional.of(valid));
    when(passwordEncoder.encode(any())).thenReturn("new-hashed");
    when(refreshTokenRepository.findAllByUserIdAndRevokedAtIsNull(any())).thenReturn(List.of());

    service.confirmReset(new PasswordResetConfirm("token", "newpassword123"));

    verify(refreshTokenRepository, times(1)).saveAll(any());
  }
}
```

- [ ] **Step 4: Run the new tests**

Run: `cd "/home/omar/new project/backend" && ./mvnw -q test -Dtest=JwtProviderTest,AuthServiceTest,PasswordResetServiceTest`
Expected: `BUILD SUCCESS`, all tests pass (no `FAILED` lines in output).

- [ ] **Step 5: Commit**

```bash
cd "/home/omar/new project" && git add backend/src/test/java/com/enterprise/erp/security/JwtProviderTest.java backend/src/test/java/com/enterprise/erp/modules/authentication
git commit -m "test: add unit tests for JwtProvider, AuthService, PasswordResetService"
```

---

### Task 11: Controller-slice tests — AuthController

**Files:**
- Create: `backend/src/test/java/com/enterprise/erp/modules/authentication/AuthControllerTest.java`

**Interfaces:**
- Consumes: `AuthController` (Task 9) via `@WebMvcTest`, with `AuthService`/`PasswordResetService` mocked via `@MockBean`.

- [ ] **Step 1: Create `backend/src/test/java/com/enterprise/erp/modules/authentication/AuthControllerTest.java`**

```java
package com.enterprise.erp.modules.authentication;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest;
import org.springframework.boot.test.mock.mockito.MockBean;
import org.springframework.http.MediaType;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.web.servlet.MockMvc;

@WebMvcTest(AuthController.class)
@org.springframework.context.annotation.Import(com.enterprise.erp.shared.web.GlobalExceptionHandler.class)
class AuthControllerTest {

  @Autowired private MockMvc mockMvc;
  @Autowired private ObjectMapper objectMapper;

  @MockBean private AuthService authService;
  @MockBean private PasswordResetService passwordResetService;

  private AuthResult sampleResult() {
    return new AuthResult(
        "access-token",
        900,
        "raw-refresh",
        Instant.now().plusSeconds(3600),
        new UserSummary(1L, "a@b.com", "A B", List.of("USER")));
  }

  @Test
  @WithMockUser
  void registerReturnsAccessTokenAndSetsRefreshCookie() throws Exception {
    when(authService.register(any())).thenReturn(sampleResult());

    mockMvc
        .perform(
            post("/api/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(
                        new RegisterRequest("a@b.com", "password123", "A B"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.accessToken").value("access-token"))
        .andExpect(jsonPath("$.user.email").value("a@b.com"));
  }

  @Test
  @WithMockUser
  void registerRejectsInvalidEmail() throws Exception {
    mockMvc
        .perform(
            post("/api/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(
                        new RegisterRequest("not-an-email", "password123", "A B"))))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.error").value("VALIDATION_ERROR"));
  }

  @Test
  @WithMockUser
  void registerRejectsShortPassword() throws Exception {
    mockMvc
        .perform(
            post("/api/auth/register")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    objectMapper.writeValueAsString(new RegisterRequest("a@b.com", "short", "A B"))))
        .andExpect(status().isBadRequest());
  }

  @Test
  @WithMockUser
  void loginReturnsAccessToken() throws Exception {
    when(authService.login(any())).thenReturn(sampleResult());

    mockMvc
        .perform(
            post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(new LoginRequest("a@b.com", "password123"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.accessToken").value("access-token"));
  }

  @Test
  @WithMockUser
  void passwordResetRequestAlwaysAccepted() throws Exception {
    mockMvc
        .perform(
            post("/api/auth/password-reset/request")
                .contentType(MediaType.APPLICATION_JSON)
                .content(objectMapper.writeValueAsString(new PasswordResetRequest("a@b.com"))))
        .andExpect(status().isAccepted());
  }
}
```

- [ ] **Step 2: Run the new tests**

Run: `cd "/home/omar/new project/backend" && ./mvnw -q test -Dtest=AuthControllerTest`
Expected: `BUILD SUCCESS`, all tests pass.

- [ ] **Step 3: Run the full backend verification (compile + all tests + checkstyle + spotless)**

Run: `cd "/home/omar/new project/backend" && ./mvnw -q spotless:apply && ./mvnw verify`
Expected: `BUILD SUCCESS` at the end. If checkstyle/spotless fail on formatting from earlier tasks' code, `spotless:apply` auto-fixes it — re-run `verify` after.

- [ ] **Step 4: Commit**

```bash
cd "/home/omar/new project" && git add backend/src/test/java/com/enterprise/erp/modules/authentication/AuthControllerTest.java
git add -u backend  # in case spotless:apply reformatted anything from earlier tasks
git commit -m "test: add AuthController slice tests, run full mvn verify green"
```

---

### Task 12: Live verification — real Postgres, real running app, curl smoke test

**Files:** none (verification only — this task creates no new source files, it proves Tasks 1–11 work together against a real database and a real running server, which no prior task's `mvn compile`/`mvn test` could do)

**Interfaces:** none

- [ ] **Step 1: Bring up Postgres, Redis, RabbitMQ**

Check for a port-5432 conflict first — this environment has been observed to have a native (non-Docker) Postgres already bound to `127.0.0.1:5432`, unrelated to this project: `ss -ltn | grep 5432 || true`. If something is already listening on 5432, set `POSTGRES_HOST_PORT` to an unused port (e.g. `5434`) for every command in this task — `docker-compose.yml`'s postgres service maps `${POSTGRES_HOST_PORT:-5432}:5432`, so `POSTGRES_HOST_PORT=5434 docker compose up -d postgres redis rabbitmq` works without editing the compose file. If 5432 is free, omit the env var and use the default.

Run: `cd "/home/omar/new project" && [POSTGRES_HOST_PORT=5434] docker compose up -d postgres redis rabbitmq`
Expected: three containers start; `docker compose ps` shows `postgres` as `healthy` within ~15s (poll with `docker compose ps postgres` if not immediately healthy, don't guess with a blind sleep).

- [ ] **Step 2: Start the backend (this runs Flyway migrations automatically on boot per `spring.flyway.enabled: true`)** — if you used an alternate `POSTGRES_HOST_PORT` in Step 1, the backend (running locally via `mvnw`, not in Docker) needs `SPRING_DATASOURCE_URL` pointed at that same port, since its own default is hardcoded to 5432.

Run (background, since it's a long-running server): `cd "/home/omar/new project/backend" && [SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5434/erp] JWT_SECRET=local-verification-secret-at-least-32-characters ./mvnw spring-boot:run > /tmp/backend-dev.log 2>&1 &` then poll `curl -sf http://localhost:8080/api/health` until it responds (up to 60s — first boot compiles and runs Flyway). Note `JWT_SECRET` must be set explicitly now (Task 1's security fix removed the insecure default from the base config — only `dev`/`test` profiles have a fallback, and `spring-boot:run` without an explicit `SPRING_PROFILES_ACTIVE` uses the base config's own `spring.profiles.active: dev` default, which DOES carry the dev fallback — so this env var is technically redundant with the dev profile default, but set it explicitly anyway for clarity and to keep this step correct even if profile defaults change later).
Expected: `{"service":"enterprise-erp","probe":"health","status":"UP",...}`. If it fails, read `/tmp/backend-dev.log` for the actual error (most likely cause: a Flyway checksum/syntax issue in Task 2's SQL, or a bean-wiring issue from Task 5's `AuthenticationManager`/`UserDetailsService` — fix forward on this branch, don't skip this step).

- [ ] **Step 3: Register the first user and confirm SUPER_ADMIN bootstrap**

Run:
```bash
curl -s -c /tmp/erp-cookies.txt -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"password123","fullName":"Admin User"}' | tee /tmp/register-response.json
```
Expected: HTTP 200, JSON body with `"accessToken"` and `"user":{"email":"admin@example.com","roles":["USER","SUPER_ADMIN"]}` (order of roles in the array may vary — check both are present, not exact order). `/tmp/erp-cookies.txt` should now contain a `refreshToken` cookie (confirm with `grep refreshToken /tmp/erp-cookies.txt`).

- [ ] **Step 4: Confirm the RBAC-protected endpoint accepts the SUPER_ADMIN**

Run: `TOKEN=$(python3 -c "import json;print(json.load(open('/tmp/register-response.json'))['accessToken'])"); curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/api/auth/users -H "Authorization: Bearer $TOKEN"`
Expected: `200`.

- [ ] **Step 5: Register a second user and confirm they do NOT get SUPER_ADMIN, and the protected endpoint rejects them**

Run:
```bash
curl -s -X POST http://localhost:8080/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"second@example.com","password":"password123","fullName":"Second User"}' | tee /tmp/register2-response.json
TOKEN2=$(python3 -c "import json;print(json.load(open('/tmp/register2-response.json'))['accessToken'])")
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:8080/api/auth/users -H "Authorization: Bearer $TOKEN2"
```
Expected: register response has `"roles":["USER"]` only; the `/api/auth/users` call returns `403`.

- [ ] **Step 6: Confirm refresh rotation works (using the admin's cookie jar from Step 3)**

Run: `curl -s -b /tmp/erp-cookies.txt -c /tmp/erp-cookies.txt -X POST http://localhost:8080/api/auth/refresh | tee /tmp/refresh-response.json`
Expected: HTTP 200, new `"accessToken"` different from the Step 3 one.

- [ ] **Step 7: Confirm logout revokes the session (refresh after logout must fail)**

Run:
```bash
curl -s -b /tmp/erp-cookies.txt -c /tmp/erp-cookies.txt -X POST http://localhost:8080/api/auth/logout -o /dev/null -w "%{http_code}\n"
curl -s -b /tmp/erp-cookies.txt -X POST http://localhost:8080/api/auth/refresh -o /dev/null -w "%{http_code}\n"
```
Expected: logout returns `204`; the post-logout refresh attempt returns `401`.

- [ ] **Step 8: Confirm password reset request/confirm flow works end-to-end (reading the token from the log, since `LoggingEmailSender` logs it rather than sending real email)**

Run:
```bash
curl -s -X POST http://localhost:8080/api/auth/password-reset/request -H "Content-Type: application/json" -d '{"email":"second@example.com"}' -o /dev/null -w "%{http_code}\n"
RESET_TOKEN=$(grep -o 'token=[^ "]*' /tmp/backend-dev.log | tail -1 | cut -d= -f2)
curl -s -X POST http://localhost:8080/api/auth/password-reset/confirm -H "Content-Type: application/json" -d "{\"token\":\"$RESET_TOKEN\",\"newPassword\":\"newpassword456\"}" -o /dev/null -w "%{http_code}\n"
curl -s -X POST http://localhost:8080/api/auth/login -H "Content-Type: application/json" -d '{"email":"second@example.com","password":"newpassword456"}' -o /dev/null -w "%{http_code}\n"
```
Expected: request `202`, confirm `204`, login with the NEW password `200`.

- [ ] **Step 9: Stop the backend**

Run: `pkill -f "spring-boot:run" || true`
(Leave `postgres`/`redis`/`rabbitmq` running — Task 17's frontend verification and any future session may reuse them; stopping them is not required by this task.)

- [ ] **Step 10: Record results and commit nothing new (verification-only task) — proceed to frontend tasks**

If every expectation above held, backend Authentication is fully verified end-to-end against a real database. If any step failed, fix the root cause in the relevant earlier task's files on this branch, re-run from Step 2, and do not proceed to frontend tasks until this task passes clean.

---

### Task 13: Frontend — `api.ts` fetch wrapper + `authStore.ts`

**Files:**
- Create: `frontend/src/services/api.ts`
- Create: `frontend/src/types/auth.ts`
- Create: `frontend/src/stores/authStore.ts`
- Modify: `frontend/vite.config.ts`

**Interfaces:**
- Consumes: backend contract from Task 9 — `POST /api/auth/{register,login,refresh,logout}` return `{ accessToken: string, expiresInSeconds: number, user: { id, email, fullName, roles: string[] } }` (logout returns 204 no body); errors return `{ error: string, message: string, timestamp: string }` with 4xx/5xx status.
- Produces: `apiFetch<T>(path: string, options?: RequestInit): Promise<T>` (throws `ApiError` — a class, not the backend DTO name, to avoid confusion — on non-2xx, with `.status`/`.code`/`.message`) — consumed by Task 14/15's pages. `useAuthStore` (Zustand, NOT persisted) with state `{ accessToken: string | null, user: UserSummary | null, status: "idle" | "authenticating" | "authenticated" | "anonymous" }` and actions `register`, `login`, `logout`, `bootstrap` (attempts silent refresh, sets status to `authenticated` or `anonymous`) — consumed by Task 14/15 (pages call `login`/`register`) and Task 16 (`App.tsx` calls `bootstrap` on mount, `AppShell` calls `logout`).

- [ ] **Step 1: Create `frontend/src/types/auth.ts`**

```ts
export type UserSummary = {
  id: number;
  email: string;
  fullName: string;
  roles: string[];
};

export type AccessTokenResponse = {
  accessToken: string;
  expiresInSeconds: number;
  user: UserSummary;
};
```

- [ ] **Step 2: Create `frontend/src/services/api.ts`**

```ts
const API_BASE = "/api";

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type ApiFetchOptions = RequestInit & { accessToken?: string | null };

export async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
  const { accessToken, headers, ...rest } = options;
  const response = await fetch(`${API_BASE}${path}`, {
    ...rest,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
  });

  if (response.status === 204) {
    return undefined as T;
  }

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(
      response.status,
      body?.error ?? "UNKNOWN_ERROR",
      body?.message ?? "Something went wrong",
    );
  }

  return body as T;
}
```

- [ ] **Step 3: Create `frontend/src/stores/authStore.ts`**

```ts
import { create } from "zustand";
import { apiFetch, ApiError } from "@/services/api";
import type { AccessTokenResponse, UserSummary } from "@/types/auth";

type AuthStatus = "idle" | "authenticating" | "authenticated" | "anonymous";

type AuthState = {
  accessToken: string | null;
  user: UserSummary | null;
  status: AuthStatus;
  error: string | null;
  register: (email: string, password: string, fullName: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  bootstrap: () => Promise<void>;
};

export const useAuthStore = create<AuthState>()((set) => ({
  accessToken: null,
  user: null,
  status: "idle",
  error: null,

  register: async (email, password, fullName) => {
    set({ status: "authenticating", error: null });
    try {
      const result = await apiFetch<AccessTokenResponse>("/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password, fullName }),
      });
      set({ accessToken: result.accessToken, user: result.user, status: "authenticated" });
    } catch (err) {
      set({ status: "anonymous", error: errorMessage(err) });
      throw err;
    }
  },

  login: async (email, password) => {
    set({ status: "authenticating", error: null });
    try {
      const result = await apiFetch<AccessTokenResponse>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      set({ accessToken: result.accessToken, user: result.user, status: "authenticated" });
    } catch (err) {
      set({ status: "anonymous", error: errorMessage(err) });
      throw err;
    }
  },

  logout: async () => {
    try {
      await apiFetch<void>("/auth/logout", { method: "POST" });
    } finally {
      set({ accessToken: null, user: null, status: "anonymous", error: null });
    }
  },

  bootstrap: async () => {
    try {
      const result = await apiFetch<AccessTokenResponse>("/auth/refresh", { method: "POST" });
      set({ accessToken: result.accessToken, user: result.user, status: "authenticated" });
    } catch {
      set({ accessToken: null, user: null, status: "anonymous" });
    }
  },
}));

function errorMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : "Something went wrong";
}
```

- [ ] **Step 4: Add a dev-server proxy so relative `/api` calls reach the backend on 8080 — replace `frontend/vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8080",
        changeOrigin: true,
      },
    },
  },
});
```

This is dev-server-only (Vite's `server.proxy` has no effect on `vite build`) — production serving (`frontend/Dockerfile`, `docker-compose.yml`) already runs the frontend and backend as separate containers and is unaffected by this change; that setup's own reverse-proxy/base-URL story is out of scope for this task (not part of the Authentication module's spec) and untouched here.

- [ ] **Step 5: Verify**

Run: `cd "/home/omar/new project/frontend" && npm run check`
Expected: PASS (new files only add exports, nothing consumes them yet, so this just proves they're well-typed).

- [ ] **Step 6: Commit**

```bash
cd "/home/omar/new project" && git add frontend/src/services/api.ts frontend/src/types/auth.ts frontend/src/stores/authStore.ts frontend/vite.config.ts
git commit -m "feat(frontend): add API fetch wrapper, auth store, dev proxy to backend"
```

---

### Task 14: Frontend — `AuthLayout`, `LoginPage`, `RegisterPage`

**Files:**
- Create: `frontend/src/features/auth/AuthLayout.tsx`
- Create: `frontend/src/features/auth/LoginPage.tsx`
- Create: `frontend/src/features/auth/RegisterPage.tsx`

**Interfaces:**
- Consumes: `useAuthStore` (Task 13). Reuses the shell's established visual language from sub-project 1 (flat zinc/emerald, `rounded-2xl`, `border-zinc-200 dark:border-zinc-800`, `bg-white dark:bg-zinc-900`) — these are new pages, not modifications to `AppShell`/`OverviewPage`, but must look like they belong to the same app.
- Produces: `AuthLayout` (wraps a centered card, takes `title`/`subtitle`/`children` props) — consumed by `LoginPage`, `RegisterPage`, and Task 15's two pages. `LoginPage`/`RegisterPage` as default-exportless named function components — consumed by Task 16 (`App.tsx` routes).

- [ ] **Step 1: Create `frontend/src/features/auth/AuthLayout.tsx`**

```tsx
import type { ReactNode } from "react";
import { BrandMark } from "@/components/BrandMark";

type AuthLayoutProps = {
  title: string;
  subtitle: string;
  children: ReactNode;
};

export function AuthLayout({ title, subtitle, children }: AuthLayoutProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <div className="w-full max-w-md">
        <div className="mb-6 flex justify-center">
          <BrandMark />
        </div>
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 dark:border-zinc-800 dark:bg-zinc-900">
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{subtitle}</p>
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

export function AuthField({
  label,
  ...props
}: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
      <input
        {...props}
        className="mt-1 w-full rounded-2xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition focus:border-emerald-500/60 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
      />
    </label>
  );
}

export function AuthSubmitButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      type="submit"
      className="w-full rounded-2xl bg-emerald-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {children}
    </button>
  );
}

export function AuthErrorText({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="rounded-2xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700 dark:text-red-300">
      {message}
    </p>
  );
}
```

- [ ] **Step 2: Create `frontend/src/features/auth/LoginPage.tsx`**

```tsx
import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { AuthErrorText, AuthField, AuthLayout, AuthSubmitButton } from "@/features/auth/AuthLayout";

export function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);
  const status = useAuthStore((state) => state.status);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await login(email, password);
      navigate("/", { replace: true });
    } catch {
      setError("Email or password is incorrect.");
    }
  }

  return (
    <AuthLayout title="Sign in" subtitle="Welcome back to Enterprise ERP">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <AuthErrorText message={error} />
        <AuthField
          label="Email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <AuthField
          label="Password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <AuthSubmitButton disabled={status === "authenticating"}>
          {status === "authenticating" ? "Signing in…" : "Sign in"}
        </AuthSubmitButton>
      </form>
      <div className="mt-4 flex justify-between text-sm text-zinc-500 dark:text-zinc-400">
        <Link to="/forgot-password" className="hover:text-emerald-600 dark:hover:text-emerald-400">
          Forgot password?
        </Link>
        <Link to="/register" className="hover:text-emerald-600 dark:hover:text-emerald-400">
          Create account
        </Link>
      </div>
    </AuthLayout>
  );
}
```

- [ ] **Step 3: Create `frontend/src/features/auth/RegisterPage.tsx`**

```tsx
import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";
import { AuthErrorText, AuthField, AuthLayout, AuthSubmitButton } from "@/features/auth/AuthLayout";

export function RegisterPage() {
  const navigate = useNavigate();
  const register = useAuthStore((state) => state.register);
  const status = useAuthStore((state) => state.status);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await register(email, password, fullName);
      navigate("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed.");
    }
  }

  return (
    <AuthLayout title="Create account" subtitle="Set up your Enterprise ERP workspace access">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <AuthErrorText message={error} />
        <AuthField
          label="Full name"
          type="text"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
        <AuthField
          label="Email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <AuthField
          label="Password"
          type="password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <AuthSubmitButton disabled={status === "authenticating"}>
          {status === "authenticating" ? "Creating account…" : "Create account"}
        </AuthSubmitButton>
      </form>
      <div className="mt-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
        Already have an account?{" "}
        <Link to="/login" className="hover:text-emerald-600 dark:hover:text-emerald-400">
          Sign in
        </Link>
      </div>
    </AuthLayout>
  );
}
```

- [ ] **Step 4: Verify**

Run: `cd "/home/omar/new project/frontend" && npm run check`
Expected: PASS. (Routing isn't wired yet — Task 16 — so these components are unused-but-exported at this point, which `tsc`/`eslint` accept since they're exported, not dead local code.)

- [ ] **Step 5: Commit**

```bash
cd "/home/omar/new project" && git add frontend/src/features/auth/AuthLayout.tsx frontend/src/features/auth/LoginPage.tsx frontend/src/features/auth/RegisterPage.tsx
git commit -m "feat(frontend): add AuthLayout, LoginPage, RegisterPage"
```

---

### Task 15: Frontend — `ForgotPasswordPage`, `ResetPasswordPage`

**Files:**
- Create: `frontend/src/features/auth/ForgotPasswordPage.tsx`
- Create: `frontend/src/features/auth/ResetPasswordPage.tsx`

**Interfaces:**
- Consumes: `apiFetch` (Task 13, called directly — these flows aren't session state, so they bypass `authStore`), `AuthLayout`/`AuthField`/`AuthSubmitButton`/`AuthErrorText` (Task 14). Backend contract: `POST /auth/password-reset/request { email }` → 202 always; `POST /auth/password-reset/confirm { token, newPassword }` → 204 on success, throws `ApiError` (e.g. `INVALID_TOKEN`) on failure.
- Produces: `ForgotPasswordPage`, `ResetPasswordPage` — consumed by Task 16 (`App.tsx` routes at `/forgot-password` and `/reset-password`).

- [ ] **Step 1: Create `frontend/src/features/auth/ForgotPasswordPage.tsx`**

```tsx
import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { apiFetch } from "@/services/api";
import { AuthField, AuthLayout, AuthSubmitButton } from "@/features/auth/AuthLayout";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      await apiFetch<void>("/auth/password-reset/request", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
    } finally {
      setSubmitting(false);
      setSubmitted(true);
    }
  }

  if (submitted) {
    return (
      <AuthLayout title="Check your email" subtitle="Password reset instructions are on their way">
        <p className="text-sm text-zinc-600 dark:text-zinc-300">
          If an account exists for <span className="font-medium">{email}</span>, we&apos;ve sent a link
          to reset the password. The link expires in 1 hour.
        </p>
        <Link
          to="/login"
          className="mt-6 inline-block text-sm text-emerald-600 hover:text-emerald-700 dark:text-emerald-400"
        >
          Back to sign in
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Forgot password" subtitle="We'll email you a link to reset it">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <AuthField
          label="Email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <AuthSubmitButton disabled={submitting}>
          {submitting ? "Sending…" : "Send reset link"}
        </AuthSubmitButton>
      </form>
      <div className="mt-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
        <Link to="/login" className="hover:text-emerald-600 dark:hover:text-emerald-400">
          Back to sign in
        </Link>
      </div>
    </AuthLayout>
  );
}
```

- [ ] **Step 2: Create `frontend/src/features/auth/ResetPasswordPage.tsx`**

```tsx
import { FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { apiFetch, ApiError } from "@/services/api";
import { AuthErrorText, AuthField, AuthLayout, AuthSubmitButton } from "@/features/auth/AuthLayout";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get("token") ?? "";
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await apiFetch<void>("/auth/password-reset/confirm", {
        method: "POST",
        body: JSON.stringify({ token, newPassword }),
      });
      navigate("/login", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Reset failed, please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!token) {
    return (
      <AuthLayout title="Invalid link" subtitle="This password reset link is missing its token">
        <Link to="/forgot-password" className="text-sm text-emerald-600 hover:text-emerald-700 dark:text-emerald-400">
          Request a new link
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Set new password" subtitle="Choose a new password for your account">
      <form className="space-y-4" onSubmit={handleSubmit}>
        <AuthErrorText message={error} />
        <AuthField
          label="New password"
          type="password"
          required
          minLength={8}
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
        />
        <AuthSubmitButton disabled={submitting}>
          {submitting ? "Updating…" : "Update password"}
        </AuthSubmitButton>
      </form>
    </AuthLayout>
  );
}
```

- [ ] **Step 3: Verify**

Run: `cd "/home/omar/new project/frontend" && npm run check`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd "/home/omar/new project" && git add frontend/src/features/auth/ForgotPasswordPage.tsx frontend/src/features/auth/ResetPasswordPage.tsx
git commit -m "feat(frontend): add ForgotPasswordPage and ResetPasswordPage"
```

---

### Task 16: Routing wiring — public/protected split, silent-refresh boot, logout button

**Files:**
- Create: `frontend/src/features/auth/ProtectedRoute.tsx`
- Modify: `frontend/src/App.tsx` (full file)
- Modify: `frontend/src/layouts/AppShell.tsx` (full file)

**Interfaces:**
- Consumes: `useAuthStore` (Task 13), `LoginPage`/`RegisterPage` (Task 14), `ForgotPasswordPage`/`ResetPasswordPage` (Task 15).
- Produces: `ProtectedRoute` (wraps `<Outlet/>`, redirects to `/login` if `status === "anonymous"`, renders a minimal loading state if `status` is `"idle"`/`"authenticating"` during the initial boot check, otherwise renders `<Outlet/>`) — used only inside `App.tsx`, not consumed elsewhere.

- [ ] **Step 1: Create `frontend/src/features/auth/ProtectedRoute.tsx`**

```tsx
import { Navigate, Outlet } from "react-router-dom";
import { useAuthStore } from "@/stores/authStore";

export function ProtectedRoute() {
  const status = useAuthStore((state) => state.status);

  if (status === "idle" || status === "authenticating") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
        Loading…
      </div>
    );
  }

  if (status === "anonymous") {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
```

- [ ] **Step 2: Replace `frontend/src/App.tsx`**

```tsx
import { useEffect } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "@/layouts/AppShell";
import { OverviewPage } from "@/pages/OverviewPage";
import { LoginPage } from "@/features/auth/LoginPage";
import { RegisterPage } from "@/features/auth/RegisterPage";
import { ForgotPasswordPage } from "@/features/auth/ForgotPasswordPage";
import { ResetPasswordPage } from "@/features/auth/ResetPasswordPage";
import { ProtectedRoute } from "@/features/auth/ProtectedRoute";
import { useAuthStore } from "@/stores/authStore";

const queryClient = new QueryClient();

export function App() {
  const bootstrap = useAuthStore((state) => state.bootstrap);

  useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route index element={<OverviewPage />} />
            </Route>
          </Route>
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 3: Replace `frontend/src/layouts/AppShell.tsx`** — same as the sub-project-1 version, with one addition: a `useNavigate`+`useAuthStore` logout handler and a "Sign out" button placed after `LocaleSwitch` in the header's button group.

```tsx
import { Outlet, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { LogOut } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { LocaleSwitch } from "@/components/LocaleSwitch";
import { ModeSwitch } from "@/components/ModeSwitch";
import { copy } from "@/app/copy";
import { navigationGroups } from "@/app/navigation";
import { useUiStore } from "@/stores/uiStore";
import { useAuthStore } from "@/stores/authStore";

export function AppShell() {
  const locale = useUiStore((state) => state.locale);
  const theme = useUiStore((state) => state.theme);
  const toggleTheme = useUiStore((state) => state.toggleTheme);
  const toggleLocale = useUiStore((state) => state.toggleLocale);
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const navigate = useNavigate();

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [locale, theme]);

  const ui = copy[locale];

  async function handleLogout() {
    await logout();
    navigate("/login", { replace: true });
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      <div className="mx-auto flex min-h-screen w-full max-w-[1600px] flex-col gap-6 px-4 py-4 md:px-6 lg:px-8">
        <header className="rounded-2xl border border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900 md:px-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <BrandMark />
            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
                API ready
              </div>
              {user ? (
                <div className="rounded-full border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs font-medium text-zinc-600 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-300">
                  {user.fullName}
                </div>
              ) : null}
              <ModeSwitch mode={theme} onToggle={toggleTheme} />
              <LocaleSwitch locale={locale} onToggle={toggleLocale} />
              <button
                type="button"
                onClick={handleLogout}
                aria-label="Sign out"
                className="inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-700 transition hover:border-emerald-500/60 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800"
              >
                <LogOut className="h-4 w-4" />
                <span>Sign out</span>
              </button>
            </div>
          </div>
        </header>

        <div className="grid flex-1 gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
          <aside className="rounded-2xl border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-4">
              <p className="text-xs uppercase tracking-[0.3em] text-zinc-500 dark:text-zinc-400">{ui.workspace}</p>
              <h1 className="mt-2 text-xl font-semibold">{ui.brand}</h1>
              <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">{ui.tagline}</p>
            </div>

            <nav aria-label="Primary" className="space-y-4">
              {navigationGroups.map(({ key, items }) => (
                <div key={key ?? "root"}>
                  {key ? (
                    <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-500">
                      {ui.navGroups[key]}
                    </p>
                  ) : null}
                  <div className="space-y-1">
                    {items.map(({ label, icon: Icon }) => (
                      <a
                        key={label}
                        href="#"
                        className="flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
                      >
                        <Icon className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                        <span>{label}</span>
                      </a>
                    ))}
                  </div>
                </div>
              ))}
            </nav>

            <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-950">
              <p className="text-xs uppercase tracking-[0.3em] text-zinc-500 dark:text-zinc-400">{ui.systemHealth}</p>
              <div className="mt-3 flex items-center justify-between text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">Uptime</span>
                <span className="font-medium text-emerald-600 dark:text-emerald-300">99.98%</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm">
                <span className="text-zinc-600 dark:text-zinc-300">Latency</span>
                <span className="font-medium text-zinc-900 dark:text-zinc-100">42 ms</span>
              </div>
            </div>
          </aside>

          <main className="space-y-6">
            <section className="rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-zinc-500 dark:text-zinc-400">{ui.operationsPulse}</p>
                  <h2 className="mt-2 text-3xl font-semibold">Enterprise command center</h2>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                    A responsive, mobile-first shell for future ERP modules with clear
                    navigation, accessible surfaces, and bilingual direction support.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Metric label="Modules" value="21" />
                  <Metric label="Ready" value="Foundation" />
                  <Metric label="Locale" value={locale.toUpperCase()} />
                </div>
              </div>
            </section>

            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[120px] rounded-2xl border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-800 dark:bg-zinc-950">
      <div className="text-xs uppercase tracking-[0.2em] text-zinc-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-zinc-900 dark:text-white">{value}</div>
    </div>
  );
}
```

- [ ] **Step 4: Verify**

Run: `cd "/home/omar/new project/frontend" && npm run check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd "/home/omar/new project" && git add frontend/src/features/auth/ProtectedRoute.tsx frontend/src/App.tsx frontend/src/layouts/AppShell.tsx
git commit -m "feat(frontend): wire public/protected routing, silent-refresh boot, logout button"
```

---

### Task 17: Live frontend verification — headless Chromium, full flow

**Files:** none (verification only)

**Interfaces:** none

- [ ] **Step 1: Ensure backend + infra are running** (postgres/redis/rabbitmq from Task 12 should still be up; the backend was stopped at the end of Task 12) — use the same `POSTGRES_HOST_PORT`/`SPRING_DATASOURCE_URL`/`JWT_SECRET` overrides Task 12 Step 1/2 used, if it needed them for a port-5432 conflict in this environment.

Run: `docker compose -f "/home/omar/new project/docker-compose.yml" ps postgres` — if not `healthy`, run `cd "/home/omar/new project" && [POSTGRES_HOST_PORT=5434] docker compose up -d postgres redis rabbitmq` and wait for healthy.
Run: `cd "/home/omar/new project/backend" && [SPRING_DATASOURCE_URL=jdbc:postgresql://localhost:5434/erp] JWT_SECRET=local-verification-secret-at-least-32-characters ./mvnw spring-boot:run > /tmp/backend-dev.log 2>&1 &` then poll `curl -sf http://localhost:8080/api/health` until it responds.

- [ ] **Step 2: Start the frontend dev server**

Run: `cd "/home/omar/new project/frontend" && npm run dev -- --port 5173 --host > /tmp/vite-dev.log 2>&1 &` then poll `curl -sf http://localhost:5173` until it responds.

- [ ] **Step 3: Run `npm run check` one final time for the whole branch's frontend changes**

Run: `cd "/home/omar/new project/frontend" && npm run check`
Expected: PASS.

- [ ] **Step 4: Headless-Chromium script driving the real flow** — reuse the same tool/pattern as the shell restyle sub-project (Playwright via a throwaway local install if `chromium-cli` isn't available — see that sub-project's verification notes for the exact fallback commands). Script the following against `http://localhost:5173`, taking a screenshot after each major step and checking `console --errors`/`page.on("console")` for zero errors throughout:

1. Navigate to `/` while logged out → confirm redirect to `/login` (protected-route redirect works).
2. On `/register`, fill in a new unique email/password/full name, submit → confirm redirect to `/` and the shell renders with the new user's name visible in the header (the `user.fullName` badge added in Task 16).
3. Click "Sign out" → confirm redirect to `/login` and that navigating back to `/` redirects to `/login` again (session actually ended, not just a client-side route change).
4. On `/login`, submit with a wrong password → confirm an inline error message appears, no navigation happens.
5. On `/login`, submit with the correct credentials from step 2 → confirm redirect to `/` and the shell renders.
6. Reload the page (`page.reload()`) while authenticated → confirm the shell still renders (not bounced to `/login`) — this specifically proves the silent-refresh-on-boot flow (`bootstrap()` + the HttpOnly cookie) works, not just in-memory state surviving a client-side navigation.
7. Navigate to `/forgot-password`, submit the email from step 2 → confirm the "check your email" success message renders.

Expected: every step's assertion holds, zero console errors at any point. If step 6 fails (bounced to `/login` on reload), the bug is almost certainly in `ProtectedRoute`/`bootstrap()` ordering or the refresh cookie's `path`/`SameSite` attributes from Task 9 — fix forward on this branch before proceeding.

- [ ] **Step 5: Stop dev servers**

Run: `pkill -f "vite" || true; pkill -f "spring-boot:run" || true`

- [ ] **Step 6: Update `CLAUDE.md` status log** with what landed, the branch name, and next steps (per this session's standing instruction to log progress before stopping — see the repo's `CLAUDE.md` "Conventions" section and this session's own authorization message for the exact expectations).

- [ ] **Step 7: Commit the status log update**

```bash
cd "/home/omar/new project" && git add CLAUDE.md
git commit -m "docs: update status log after Authentication module implementation"
```

---

