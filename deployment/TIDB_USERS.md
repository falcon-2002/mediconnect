# TiDB application users: proposed setup and approval gates

No live SQL or cloud action was executed by the agent. The owner's completed read-only audit reports all four application databases exist with zero tables, CHECK=1, foreign_key_checks=1, pessimistic transactions, NO_AUTO_CREATE_USER present, and an empty existing-user result. Earlier preflight reported TiDB 8.5.3. These are owner-confirmed results, not agent measurements. Empty user output is not proof of administrator-level visibility; CREATE must still fail on a collision. Do not recreate these databases or repeat the global CHECK-setting change.

## What can be prepared without credentials

TiDB Starter supports CREATE USER/GRANT and prefixed SQL users. Four separate, restricted users are supported in principle; an authorized administrator must have CREATE USER and the privileges being granted WITH GRANT OPTION. The agent has no authenticated TiDB connector/CLI. The owner supplied the inventory above; the executing administrator's actual privileges and live application-user isolation remain unverified.

Proposed account suffixes are short enough for a typical Starter prefix: `mc_auth`, `mc_patient`, `mc_doctor`, `mc_appointment`. Obtain the exact prefix from **My TiDB -> existing instance -> Connect**. The full account is `PREFIX.mc_auth` (and similarly for the others); use the exact case and check the resulting username length against the provider limit. A SQL Editor token/proxy identity is not a password-based service account and cannot be copied into Render as its SQL user.

The checked-in Render configuration, production profiles and deployment environment template contain variable names only, not an instance-specific prefix. Enter/substitute it locally: if Connect displays `PREFIX.root`, replace every `__TIDB_PREFIX__` with just `PREFIX`, retaining the single dot and service suffix from this template. Do not search secret files or send a credential-bearing connection string to obtain it. The SQL file deliberately does not guess an account name.

No account has been created or adopted. If any proposed name exists at any host, stop its block and inspect it. Do not use IF NOT EXISTS, reset its password, revoke its grants, or grant additional privileges merely because the suffix matches. A rerun must inventory first; successfully created accounts from an interrupted run are preserved and reviewed individually.

Also look for already-dedicated service users with DIFFERENT suffixes. Existing approved Auth/Patient/Doctor/Appointment users should be preserved under their exact names; do not create a second set just because this proposal uses mc_* suffixes. Any reuse or grant delta must be based on their actual purpose/current grants and approved separately.

## Read-only inventory (owner completed; refresh before writes)

1. Open the existing instance's **SQL Editor** (or the existing approved TLS Workbench admin connection). The generic **Settings -> SQL Users** page documented for Dedicated is a preview/request-only feature and must not be assumed available on Starter. Do not purchase/upgrade to obtain it.
2. Run [tidb-user-audit.sql](tidb-user-audit.sql). It selects only identities, grants, settings, schema names and table names. No password hash/authentication-string column or patient data is selected. If access to mysql.user is denied, stop that query and use an existing authorized admin connection; do not broaden an application's grants to perform the audit.
3. Keep raw results local. Report only whether each proposed suffix exists, whether the four databases have any tables/Flyway histories, and whether NO_AUTO_CREATE_USER is present in sql_mode. The non-secret Connect prefix may be supplied to resolve the proposal, or substituted locally.
4. For any matching existing account, inspect SHOW GRANTS for its exact User/Host. Check direct privileges AND inherited roles, including non-default roles. Do not use SHOW CREATE USER, which may disclose authentication material. The current administrator's broad grants are not evidence that a new service user is restricted.

## Statements proposed for approval

The complete eight CREATE/GRANT statements, four read-only SHOW GRANTS statements, and fresh read-only checks are in [tidb-users.proposed.sql](tidb-users.proposed.sql). They are for the owner's manual review; the request to generate them does not authorize the agent to execute them. `__TIDB_PREFIX__` and password-literal markers must be resolved locally first. The password markers intentionally make the template non-executable; they are not default passwords. Execute selected statements individually, never Run All.

| Account suffix | Exact schema | Proposed schema privileges |
| --- | --- | --- |
| mc_auth | mediconnect_auth | SELECT, INSERT, CREATE, INDEX |
| mc_patient | mediconnect_patient | SELECT, INSERT, UPDATE, CREATE, ALTER, INDEX |
| mc_doctor | mediconnect_doctor | SELECT, INSERT, UPDATE, DELETE, CREATE, INDEX, REFERENCES |
| mc_appointment | mediconnect_appointment | SELECT, INSERT, UPDATE, CREATE, INDEX, REFERENCES |

These sets cover current application operations and normal fresh Flyway validate/migrate, not arbitrary future migrations or repair/clean. CREATE/INDEX are needed for application objects and Flyway's history table/success index; Patient V2 needs ALTER; Doctor/Appointment need REFERENCES. Doctor needs DELETE because updating its language collection removes child rows. Patient/Doctor deletion is otherwise soft deletion; cancellation is UPDATE, not DELETE. Auth registration/login uses SELECT/INSERT and has no account-update/delete API. No global privilege, DROP, CREATE USER, grant option, built-in admin/readwrite role, or access to another application schema is proposed. Metadata maintenance requiring other privileges is separate approved work; do not grant ALL to recover from an error.

The actual migration review is limited to these five unchanged files:

- Auth V1 creates accounts with its unique email and role CHECK.
- Patient V1 creates patients and its discovery index; V2 adds account_id and a unique constraint using ALTER TABLE.
- Doctor V1 creates doctors, doctor_languages, a discovery index, two CHECKs and one foreign key.
- Appointment V1 creates slots and appointments, indexes, one CHECK and two foreign keys.

No migration contains DROP, seed INSERTs, procedures, triggers, or cross-schema references. The installed Flyway 12.4.0 MySQL history creation uses CREATE TABLE and CREATE INDEX. This source review determines the proposed grants; live Flyway compatibility has not been tested and no migration is authorized here.

Database underscores are escaped in GRANT patterns (for example, `mediconnect\_auth`) to avoid granting access to similarly named databases. Backticks alone do not make wildcard characters literal in schema grants. `%` in the account host means any source host, not any schema; combine it with verified TLS and the provider's approved network rules. REQUIRE SSL enforces transport encryption at the account, while VERIFY_IDENTITY in the client validates the certificate and hostname.

CREATE USER fails on a collision. Run only ONE approved account block at a time, with stop-on-error; never blindly execute the entire file. Do not run its GRANT after a failed CREATE. Confirm NO_AUTO_CREATE_USER before granting so a typo cannot silently create a passwordless account. Do not add it by changing sql_mode without a separate review. Account DDL auto-commits: a surrounding transaction does not make creation/grants reversible as a group. Do not automatically drop a partly provisioned account.

## Password handling and secure execution

- Review the exact resolved accounts/grants before choosing to execute them manually. Do not put real passwords into the tracked proposal or chat. Generate a different strong password for each service in your local password manager.
- **SQL Editor limitation:** SQL itself cannot prompt for a masked password, and the documented SQL Editor offers query logs and saved SQL files, not a verified secret-binding input. Use SQL Editor to review the prefix-substituted template and execute password-free preflight, GRANT and SHOW statements. Do not paste a real password into its CREATE statements unless you have independently confirmed protected password entry and persistence/redaction behavior. Clearing the visible tab, using a private browser window, or relying on server-side log redaction does not establish that browser/cloud query history is safe. No such capability has been verified here. If unavailable, perform CREATE through the local secure path below, then return to SQL Editor for the grants. Do not replace passwords with hashes in saved SQL either: authentication material is also secret.
- If your account exposes a genuine SQL-user management dialog with a password field, use that secure field to create only the approved new users, with no broad built-in role, then apply only their approved grants. Verify the resulting grants rather than assuming the UI's role is restricted.
- Otherwise use an approved local SQL administration client such as Workbench against TiDB's actual DNS endpoint, with TLS mode **Verify Identity**, the trusted CA/root configuration from TiDB Connect, and the administrator password entered only in the local prompt. No password command-line argument or shell transcript is needed. Resolve each CREATE password literal only inside the approved client. Check its SQL-history handling before entering passwords; do not save, export, screenshot or sync password-filled statements. If the client cannot keep those statements out of local history, use its secure user-management UI or stop for an approved credential-safe execution helper. Do not assume SQL Editor query history is secret storage.
- Keep each new password in your local password manager, then enter it directly into the matching Render secret environment field when deployment is separately approved. No password-filled SQL artifact belongs in Git or this repository.
- Do not reset an existing root/admin/user password, manipulate mysql.user directly, run FLUSH PRIVILEGES after ordinary GRANT, or use the CLI `ti db create-db-sql-users` auto-repair workflow: that manages a different three-role set and may change accounts outside this proposal.

## Manual execution and safe resume

1. Resolve only the prefix in SQL Editor, inspect all four account names and schema grants, then run only the STEP 1 read-only statements. Preserve the four empty schemas. If settings differ or visibility/authority is uncertain, stop and review rather than changing settings or privileges.
2. Create one account using its explicit CREATE USER statement through the verified secure entry path above. Supply only that account's password in the local protected input. Do not run the unmodified invalid password marker. If using SQL string literals in an approved client, its escaping must match the session SQL mode; a protected user-management field avoids manual string escaping. Do not proceed after a syntax/error response that might include authentication material; keep any raw error local.
3. After confirmed CREATE success, select only that account's password-free GRANT in SQL Editor and run it with Ctrl+Enter. Then run its SHOW GRANTS. Do not select a CREATE statement together with a GRANT or use Shift+Ctrl+Enter (Run All).
4. Repeat separately for the remaining accounts. If the SQL Editor proxy lacks the required grant authority, stop; use an existing authorized secure admin connection rather than broadening service grants.
5. On a repeat/interrupted run, inventory first and SHOW GRANTS for existing exact identities. Skip every already-completed account without changing its password/grants. If CREATE succeeded and GRANT failed, preserve the user; review the exact missing grant before manually resuming only that statement. If an existing identity's ownership is uncertain, stop its block. No IF NOT EXISTS, automatic adoption, duplicate user, password reset, or rollback assumption is used.
6. Keep the four non-secret success/grant summaries only; no password-filled screenshots, SQL exports, transcripts, connection URLs containing credentials, or error payloads. Then perform the fresh-connection checks below. Do not start Spring Boot services yet: startup runs Flyway.

## Verify each account in a fresh connection

After provisioning approval and execution, reconnect separately as each exact application SQL user. Do not use an administrator session or the SQL Editor proxy for this test.

1. Use the actual endpoint hostname and client **VERIFY_IDENTITY** mode. A successful SHOW STATUS Ssl_cipher proves encryption for that session, not hostname verification; inspect the client mode/CA configuration as well. Render JDBC TLS still needs its own live verification.
2. Run CURRENT_USER(), SHOW GRANTS, and the read-only [tidb-preflight.sql](tidb-preflight.sql). Check CHECK=1, FK=1 and pessimistic mode again. The earlier owner's admin-session result does not prove fresh service sessions have identical settings.
3. Before migrations, `USE` the assigned schema (session selection only) and try each other application schema separately. Assigned schema should succeed; the other three must produce access-denied errors. Do not confuse missing tables with access denial. An unexpected success is a stop condition, not permission to revoke an existing account automatically.
4. After approved migrations, use only zero-row access tests: `SELECT 1 FROM mediconnect_auth.accounts LIMIT 0`, and similarly Patient.patients, Doctor.doctors, Appointment.slots. Execute the intended own-table test and three cross-schema tests as each user. Own access must succeed; other schemas must be denied. No row contents need to be returned.
5. Confirm grants contain no global access except USAGE, grant option, inherited broad roles, or other-schema/table/column grants. Do not run write probes against existing data to prove isolation. Any DDL/write test belongs in a separately approved disposable target.

Only after these checks and the separate [Flyway execution plan](FLYWAY_PLAN.md) are approved should any DB service be started with cloud credentials: normal Spring startup invokes Flyway automatically.

## Sources

- [Starter username prefixes](https://docs.pingcap.com/tidbcloud/select-cluster-tier/)
- [TiDB GRANT privileges and prerequisites](https://docs.pingcap.com/tidb/stable/sql-statement-grant-privileges/)
- [Privilege patterns, escaping and roles](https://docs.pingcap.com/tidb/stable/privilege-management/)
- [SQL proxy accounts](https://docs.pingcap.com/tidbcloud/sql-proxy-account/)
- [SQL Users page availability](https://docs.pingcap.com/tidbcloud/configure-sql-users/)
- [CREATE USER syntax/TLS](https://docs.pingcap.com/tidbcloud/sql-statement-create-user/)
- [SQL Editor selection, logs and saved SQL](https://docs.pingcap.com/tidbcloud/explore-data-with-sql-editor/)
- [Installed Flyway 12.4.0 history table/index SQL](https://github.com/flyway/flyway/blob/flyway-12.4.0/flyway-database/flyway-mysql/src/main/java/org/flywaydb/database/mysql/MySQLDatabase.java)
