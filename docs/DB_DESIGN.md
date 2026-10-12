# IMS 재고관리 시스템 — DB 설계 산출물

## 목차
1. [ERD (텍스트 형식)](#1-erd)
2. [DDL (CREATE TABLE)](#2-ddl)
3. [이력 관리 설계](#3-이력-관리)
4. [인덱스 전략](#4-인덱스-전략)
5. [마이그레이션 스크립트](#5-마이그레이션)
6. [주요 쿼리 예시](#6-주요-쿼리)

---

## 1. ERD

### 1-1. 전체 테이블 목록

| 테이블명 | 설명 |
|---|---|
| `departments` | 부서/팀 마스터 |
| `employees` | 직원 정보 |
| `item_categories` | 품목 분류 |
| `items` | 품목 마스터 |
| `purchase_requests` | 구매요청 헤더 |
| `purchase_request_lines` | 구매요청 라인 |
| `purchase_orders` | 발주 헤더 |
| `purchase_order_lines` | 발주 라인 |
| `receivings` | 입고 헤더 |
| `receiving_lines` | 입고 라인 |
| `inventory` | 재고 현황 |
| `inventory_transfers` | 재고이동 헤더 |
| `inventory_transfer_lines` | 재고이동 라인 |
| `inventory_usages` | 재고사용 |
| `deliveries` | 납품 헤더 |
| `delivery_lines` | 납품 라인 |
| `audit_logs` | 전체 변경 이력 |

---

### 1-2. 관계도 (텍스트 ERD)

```
┌─────────────────┐         ┌─────────────────┐
│  departments    │         │  item_categories │
│─────────────────│         │─────────────────│
│ PK dept_id      │         │ PK category_id  │
│    dept_code    │         │    category_name │
│    dept_name    │         │    parent_id(FK) │◄─┐ self-ref
│    parent_id(FK)│◄─┐      └────────┬────────┘  │
└────────┬────────┘  │               │            │
         │ self-ref  │               │            │
         │           │      ┌────────▼────────┐   │
         │           │      │     items       │   │
         │           │      │─────────────────│   │
         │           │      │ PK item_id      │   │
         │           │      │    item_code(UQ)│   │
         │           │      │    item_name    │   │
         │           │      │    category_id  │───┘
         │           │      │    unit         │
         │           │      │    unit_price   │
         │           │      └────────┬────────┘
         │           │               │
┌────────▼────────┐  │               │
│   employees     │  │               │
│─────────────────│  │               │
│ PK man_no       │  │               │
│ UQ man_id       │  │               │
│    man_name     │  │               │
│    man_roll(0/1/2)  │               │
│    dept_id(FK)  │──┘               │
└────────┬────────┘                  │
         │                           │
         │ (requester/approver)       │
         │                           │
┌────────▼──────────────────────────▼──┐
│         purchase_requests             │
│──────────────────────────────────────│
│ PK  pr_id                            │
│     pr_no (UQ)                       │
│     status: DRAFT/PENDING/APPROVED/  │
│             ORDERED/RECEIVED         │
│     dept_id (FK→departments)         │
│     requester_id (FK→employees)      │
│     approver_id  (FK→employees)      │
│     requested_at, approved_at        │
└────────────────┬─────────────────────┘
                 │ 1:N
┌────────────────▼─────────────────────┐
│       purchase_request_lines          │
│──────────────────────────────────────│
│ PK  prl_id                           │
│     pr_id (FK)                       │
│     item_id (FK→items)               │
│     qty_requested, unit_price        │
│     line_no                          │
└──────────────────────────────────────┘
                 │ (pr_id 기준 1:1)
┌────────────────▼─────────────────────┐
│          purchase_orders              │
│──────────────────────────────────────│
│ PK  po_id                            │
│     po_no (UQ)                       │
│     pr_id (FK→purchase_requests)     │
│     status: DRAFT/CONFIRMED/SENT/    │
│             PARTIALLY_RECEIVED/      │
│             FULLY_RECEIVED/CANCELLED │
│     vendor_name                      │
│     ordered_by (FK→employees)        │
│     ordered_at, expected_at          │
└────────────────┬─────────────────────┘
                 │ 1:N
┌────────────────▼─────────────────────┐
│         purchase_order_lines          │
│──────────────────────────────────────│
│ PK  pol_id                           │
│     po_id (FK)                       │
│     item_id (FK→items)               │
│     qty_ordered, qty_received        │
│     unit_price                       │
└──────────────────────────────────────┘
                 │
┌────────────────▼─────────────────────┐
│             receivings                │
│──────────────────────────────────────│
│ PK  recv_id                          │
│     recv_no (UQ)                     │
│     po_id (FK→purchase_orders)       │
│     status: PENDING/IN_PROGRESS/     │
│             COMPLETED/CANCELLED      │
│     received_by (FK→employees)       │
│     received_at                      │
└────────────────┬─────────────────────┘
                 │ 1:N
┌────────────────▼─────────────────────┐
│          receiving_lines              │
│──────────────────────────────────────│
│ PK  recvl_id                         │
│     recv_id (FK)                     │
│     pol_id  (FK→purchase_order_lines)│
│     item_id (FK→items)               │
│     qty_received, location_code      │
└──────────────────────────────────────┘
                 │ (입고 완료 시 재고 증가)
┌────────────────▼─────────────────────┐
│             inventory                 │
│──────────────────────────────────────│
│ PK  inv_id                           │
│ UQ  (item_id, dept_id, location_code)│
│     item_id (FK→items)               │
│     dept_id (FK→departments)         │
│     location_code                    │
│     qty_on_hand, qty_reserved        │
│     last_updated_at                  │
└────────────────┬─────────────────────┘
        ┌────────┴─────────┐
        │                  │
┌───────▼────────┐  ┌──────▼───────────────────────┐
│inventory_trans │  │      inventory_usages          │
│fers            │  │──────────────────────────────  │
│────────────────│  │ PK  usage_id                  │
│ PK  trf_id     │  │     inv_id  (FK→inventory)    │
│     trf_no(UQ) │  │     item_id (FK→items)        │
│     status:    │  │     dept_id (FK→departments)  │
│  PENDING/      │  │     qty_used                  │
│  APPROVED/     │  │     reason (NOT NULL)         │
│  MOVED/        │  │     used_by (FK→employees)    │
│  CANCELLED     │  │     cancelled_by(FK→employees)│
│     from_inv_id│  │     used_at, cancelled_at     │
│     to_inv_id  │  │     is_cancelled              │
│     approver_id│  └───────────────────────────────┘
│     approved_at│
│     moved_at   │
└────────────────┘

┌───────────────────────────────────────┐
│             deliveries                │
│──────────────────────────────────────│
│ PK  dlv_id                           │
│     dlv_no (UQ)                      │
│     status: PENDING/IN_PROGRESS/     │
│             DELIVERED/APPROVED/      │
│             CONSUMED                 │
│     dept_id (FK→departments)         │
│     created_by  (FK→employees)       │
│     approver_id (FK→employees)       │
│     delivered_at, approved_at        │
└────────────────┬─────────────────────┘
                 │ 1:N
┌────────────────▼─────────────────────┐
│           delivery_lines              │
│──────────────────────────────────────│
│ PK  dlvl_id                          │
│     dlv_id  (FK→deliveries)          │
│     inv_id  (FK→inventory)           │
│     item_id (FK→items)               │
│     qty_delivered                    │
└──────────────────────────────────────┘

┌───────────────────────────────────────┐
│             audit_logs                │
│──────────────────────────────────────│
│ PK  log_id (BIGSERIAL)               │
│     table_name                       │
│     record_id                        │
│     action: INSERT/UPDATE/DELETE     │
│     old_data (JSONB)                 │
│     new_data (JSONB)                 │
│     changed_by (FK→employees)        │
│     changed_at (TIMESTAMPTZ)         │
│     ip_address, session_id           │
└──────────────────────────────────────┘
```

---

## 2. DDL

### 2-1. ENUM 타입 정의

```sql
CREATE TYPE employee_role AS ENUM ('0', '1', '2');

CREATE TYPE purchase_request_status AS ENUM (
    'DRAFT', 'PENDING', 'APPROVED', 'ORDERED', 'RECEIVED', 'CANCELLED'
);

CREATE TYPE purchase_order_status AS ENUM (
    'DRAFT', 'CONFIRMED', 'SENT',
    'PARTIALLY_RECEIVED', 'FULLY_RECEIVED', 'CANCELLED'
);

CREATE TYPE receiving_status AS ENUM (
    'PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'
);

CREATE TYPE transfer_status AS ENUM (
    'PENDING', 'APPROVED', 'MOVED', 'CANCELLED'
);

CREATE TYPE delivery_status AS ENUM (
    'PENDING', 'IN_PROGRESS', 'DELIVERED', 'APPROVED', 'CONSUMED'
);

CREATE TYPE audit_action AS ENUM (
    'INSERT', 'UPDATE', 'DELETE'
);
```

### 2-2. departments

```sql
CREATE TABLE departments (
    dept_id         SERIAL          PRIMARY KEY,
    dept_code       VARCHAR(20)     NOT NULL UNIQUE,
    dept_name       VARCHAR(100)    NOT NULL,
    parent_id       INT             REFERENCES departments(dept_id) ON DELETE SET NULL,
    dept_level      SMALLINT        NOT NULL DEFAULT 1
                        CHECK (dept_level BETWEEN 1 AND 5),
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
```

### 2-3. employees

```sql
CREATE TABLE employees (
    man_no          SERIAL          PRIMARY KEY,
    man_id          VARCHAR(50)     NOT NULL UNIQUE,
    man_name        VARCHAR(100)    NOT NULL,
    man_roll        employee_role   NOT NULL DEFAULT '0',
    dept_id         INT             NOT NULL REFERENCES departments(dept_id),
    email           VARCHAR(200)    UNIQUE,
    phone           VARCHAR(30),
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
    joined_at       DATE            NOT NULL DEFAULT CURRENT_DATE,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
```

### 2-4. item_categories

```sql
CREATE TABLE item_categories (
    category_id     SERIAL          PRIMARY KEY,
    category_code   VARCHAR(20)     NOT NULL UNIQUE,
    category_name   VARCHAR(100)    NOT NULL,
    parent_id       INT             REFERENCES item_categories(category_id) ON DELETE SET NULL,
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
```

### 2-5. items

```sql
CREATE TABLE items (
    item_id         SERIAL          PRIMARY KEY,
    item_code       VARCHAR(50)     NOT NULL UNIQUE,
    item_name       VARCHAR(200)    NOT NULL,
    category_id     INT             REFERENCES item_categories(category_id),
    unit            VARCHAR(20)     NOT NULL DEFAULT 'EA',
    unit_price      NUMERIC(15, 2)  NOT NULL DEFAULT 0
                        CHECK (unit_price >= 0),
    description     TEXT,
    spec            TEXT,
    is_active       BOOLEAN         NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
```

### 2-6. purchase_requests

```sql
CREATE TABLE purchase_requests (
    pr_id           SERIAL                  PRIMARY KEY,
    pr_no           VARCHAR(30)             NOT NULL UNIQUE,
    status          purchase_request_status NOT NULL DEFAULT 'DRAFT',
    dept_id         INT                     NOT NULL REFERENCES departments(dept_id),
    requester_id    INT                     NOT NULL REFERENCES employees(man_no),
    approver_id     INT                     REFERENCES employees(man_no),
    title           VARCHAR(300)            NOT NULL,
    description     TEXT,
    total_amount    NUMERIC(15, 2)          NOT NULL DEFAULT 0
                        CHECK (total_amount >= 0),
    requested_at    TIMESTAMPTZ,
    approved_at     TIMESTAMPTZ,
    cancelled_at    TIMESTAMPTZ,
    cancel_reason   TEXT,
    created_at      TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ             NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_pr_cancel_reason
        CHECK (
            (cancelled_at IS NULL) OR
            (cancelled_at IS NOT NULL AND cancel_reason IS NOT NULL)
        ),
    CONSTRAINT chk_pr_approved_at
        CHECK (
            (status IN ('APPROVED','ORDERED','RECEIVED') AND approver_id IS NOT NULL)
            OR status NOT IN ('APPROVED','ORDERED','RECEIVED')
        )
);
```

### 2-7. purchase_request_lines

```sql
CREATE TABLE purchase_request_lines (
    prl_id          SERIAL          PRIMARY KEY,
    pr_id           INT             NOT NULL REFERENCES purchase_requests(pr_id) ON DELETE CASCADE,
    line_no         SMALLINT        NOT NULL,
    item_id         INT             NOT NULL REFERENCES items(item_id),
    qty_requested   NUMERIC(12, 3)  NOT NULL CHECK (qty_requested > 0),
    unit_price      NUMERIC(15, 2)  NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
    line_amount     NUMERIC(15, 2)  GENERATED ALWAYS AS (qty_requested * unit_price) STORED,
    note            TEXT,

    UNIQUE (pr_id, line_no)
);
```

### 2-8. purchase_orders

```sql
CREATE TABLE purchase_orders (
    po_id           SERIAL                  PRIMARY KEY,
    po_no           VARCHAR(30)             NOT NULL UNIQUE,
    pr_id           INT                     REFERENCES purchase_requests(pr_id),
    status          purchase_order_status   NOT NULL DEFAULT 'DRAFT',
    vendor_name     VARCHAR(200)            NOT NULL,
    vendor_contact  VARCHAR(200),
    ordered_by      INT                     NOT NULL REFERENCES employees(man_no),
    total_amount    NUMERIC(15, 2)          NOT NULL DEFAULT 0
                        CHECK (total_amount >= 0),
    ordered_at      TIMESTAMPTZ,
    expected_at     DATE,
    note            TEXT,
    created_at      TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ             NOT NULL DEFAULT NOW()
);
```

### 2-9. purchase_order_lines

```sql
CREATE TABLE purchase_order_lines (
    pol_id          SERIAL          PRIMARY KEY,
    po_id           INT             NOT NULL REFERENCES purchase_orders(po_id) ON DELETE CASCADE,
    prl_id          INT             REFERENCES purchase_request_lines(prl_id),
    line_no         SMALLINT        NOT NULL,
    item_id         INT             NOT NULL REFERENCES items(item_id),
    qty_ordered     NUMERIC(12, 3)  NOT NULL CHECK (qty_ordered > 0),
    qty_received    NUMERIC(12, 3)  NOT NULL DEFAULT 0 CHECK (qty_received >= 0),
    unit_price      NUMERIC(15, 2)  NOT NULL DEFAULT 0 CHECK (unit_price >= 0),
    line_amount     NUMERIC(15, 2)  GENERATED ALWAYS AS (qty_ordered * unit_price) STORED,

    UNIQUE (po_id, line_no),
    CONSTRAINT chk_pol_received_lte_ordered
        CHECK (qty_received <= qty_ordered)
);
```

### 2-10. receivings

```sql
CREATE TABLE receivings (
    recv_id         SERIAL          PRIMARY KEY,
    recv_no         VARCHAR(30)     NOT NULL UNIQUE,
    po_id           INT             NOT NULL REFERENCES purchase_orders(po_id),
    status          receiving_status NOT NULL DEFAULT 'PENDING',
    received_by     INT             NOT NULL REFERENCES employees(man_no),
    received_at     TIMESTAMPTZ,
    note            TEXT,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);
```

### 2-11. receiving_lines

```sql
CREATE TABLE receiving_lines (
    recvl_id        SERIAL          PRIMARY KEY,
    recv_id         INT             NOT NULL REFERENCES receivings(recv_id) ON DELETE CASCADE,
    pol_id          INT             NOT NULL REFERENCES purchase_order_lines(pol_id),
    item_id         INT             NOT NULL REFERENCES items(item_id),
    qty_received    NUMERIC(12, 3)  NOT NULL CHECK (qty_received > 0),
    location_code   VARCHAR(50)     NOT NULL DEFAULT 'DEFAULT',
    note            TEXT
);
```

### 2-12. inventory

```sql
CREATE TABLE inventory (
    inv_id          SERIAL          PRIMARY KEY,
    item_id         INT             NOT NULL REFERENCES items(item_id),
    dept_id         INT             NOT NULL REFERENCES departments(dept_id),
    location_code   VARCHAR(50)     NOT NULL DEFAULT 'DEFAULT',
    qty_on_hand     NUMERIC(12, 3)  NOT NULL DEFAULT 0 CHECK (qty_on_hand >= 0),
    qty_reserved    NUMERIC(12, 3)  NOT NULL DEFAULT 0 CHECK (qty_reserved >= 0),
    qty_available   NUMERIC(12, 3)  GENERATED ALWAYS AS (qty_on_hand - qty_reserved) STORED,
    last_updated_at TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    UNIQUE (item_id, dept_id, location_code),
    CONSTRAINT chk_inv_reserved_lte_onhand
        CHECK (qty_reserved <= qty_on_hand)
);
```

### 2-13. inventory_transfers

```sql
CREATE TABLE inventory_transfers (
    trf_id          SERIAL          PRIMARY KEY,
    trf_no          VARCHAR(30)     NOT NULL UNIQUE,
    status          transfer_status NOT NULL DEFAULT 'PENDING',
    from_inv_id     INT             NOT NULL REFERENCES inventory(inv_id),
    to_inv_id       INT             NOT NULL REFERENCES inventory(inv_id),
    qty_transfer    NUMERIC(12, 3)  NOT NULL CHECK (qty_transfer > 0),
    item_id         INT             NOT NULL REFERENCES items(item_id),
    reason          TEXT,
    requested_by    INT             NOT NULL REFERENCES employees(man_no),
    approver_id     INT             REFERENCES employees(man_no),
    approved_at     TIMESTAMPTZ,
    moved_at        TIMESTAMPTZ,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_trf_different_location
        CHECK (from_inv_id <> to_inv_id),
    CONSTRAINT chk_trf_moved_requires_approved
        CHECK (
            (status = 'MOVED' AND approver_id IS NOT NULL AND approved_at IS NOT NULL)
            OR status <> 'MOVED'
        )
);
```

### 2-14. inventory_usages

```sql
CREATE TABLE inventory_usages (
    usage_id        SERIAL          PRIMARY KEY,
    inv_id          INT             NOT NULL REFERENCES inventory(inv_id),
    item_id         INT             NOT NULL REFERENCES items(item_id),
    dept_id         INT             NOT NULL REFERENCES departments(dept_id),
    qty_used        NUMERIC(12, 3)  NOT NULL CHECK (qty_used > 0),
    reason          TEXT            NOT NULL,
    used_by         INT             NOT NULL REFERENCES employees(man_no),
    used_at         TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    is_cancelled    BOOLEAN         NOT NULL DEFAULT FALSE,
    cancelled_by    INT             REFERENCES employees(man_no),
    cancelled_at    TIMESTAMPTZ,
    cancel_reason   TEXT,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_usage_cancel_consistency
        CHECK (
            (is_cancelled = TRUE AND cancelled_by IS NOT NULL AND cancelled_at IS NOT NULL)
            OR is_cancelled = FALSE
        )
);
```

### 2-15. deliveries

```sql
CREATE TABLE deliveries (
    dlv_id          SERIAL          PRIMARY KEY,
    dlv_no          VARCHAR(30)     NOT NULL UNIQUE,
    status          delivery_status NOT NULL DEFAULT 'PENDING',
    dept_id         INT             NOT NULL REFERENCES departments(dept_id),
    created_by      INT             NOT NULL REFERENCES employees(man_no),
    approver_id     INT             REFERENCES employees(man_no),
    title           VARCHAR(300),
    description     TEXT,
    delivered_at    TIMESTAMPTZ,
    approved_at     TIMESTAMPTZ,
    consumed_at     TIMESTAMPTZ,
    note            TEXT,
    created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT chk_dlv_consumed_requires_approved
        CHECK (
            (status = 'CONSUMED' AND approver_id IS NOT NULL AND approved_at IS NOT NULL)
            OR status <> 'CONSUMED'
        )
);
```

### 2-16. delivery_lines

```sql
CREATE TABLE delivery_lines (
    dlvl_id         SERIAL          PRIMARY KEY,
    dlv_id          INT             NOT NULL REFERENCES deliveries(dlv_id) ON DELETE CASCADE,
    inv_id          INT             NOT NULL REFERENCES inventory(inv_id),
    item_id         INT             NOT NULL REFERENCES items(item_id),
    line_no         SMALLINT        NOT NULL,
    qty_delivered   NUMERIC(12, 3)  NOT NULL CHECK (qty_delivered > 0),
    note            TEXT,

    UNIQUE (dlv_id, line_no)
);
```

### 2-17. audit_logs (월별 파티션)

```sql
CREATE TABLE audit_logs (
    log_id          BIGSERIAL       PRIMARY KEY,
    table_name      VARCHAR(100)    NOT NULL,
    record_id       BIGINT          NOT NULL,
    action          audit_action    NOT NULL,
    old_data        JSONB,
    new_data        JSONB,
    diff_data       JSONB,
    changed_by      INT             REFERENCES employees(man_no),
    changed_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    ip_address      INET,
    session_id      VARCHAR(100),
    request_id      VARCHAR(100)
) PARTITION BY RANGE (changed_at);

-- 월별 파티션 예시
CREATE TABLE audit_logs_2026_04 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE audit_logs_2026_05 PARTITION OF audit_logs
    FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
-- 이후 pg_partman으로 자동 관리 권장
```

---

## 3. 이력 관리 설계

### 3-1. 공통 트리거 함수

```sql
CREATE OR REPLACE FUNCTION fn_audit_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_old_data  JSONB;
    v_new_data  JSONB;
    v_diff_data JSONB;
    v_action    audit_action;
    v_record_id BIGINT;
    v_changed_by INT;
BEGIN
    BEGIN
        v_changed_by := current_setting('app.current_user_id', true)::INT;
    EXCEPTION WHEN OTHERS THEN
        v_changed_by := NULL;
    END;

    IF (TG_OP = 'INSERT') THEN
        v_action    := 'INSERT';
        v_new_data  := to_jsonb(NEW);
        v_old_data  := NULL;
        v_diff_data := v_new_data;
        v_record_id := (v_new_data ->> (TG_TABLE_NAME || '_id'))::BIGINT;

    ELSIF (TG_OP = 'UPDATE') THEN
        v_action    := 'UPDATE';
        v_old_data  := to_jsonb(OLD);
        v_new_data  := to_jsonb(NEW);
        v_record_id := (v_new_data ->> (TG_TABLE_NAME || '_id'))::BIGINT;

        SELECT jsonb_object_agg(key, value)
        INTO   v_diff_data
        FROM   jsonb_each(v_new_data) AS n(key, value)
        WHERE  v_old_data ->> key IS DISTINCT FROM v_new_data ->> key;

    ELSIF (TG_OP = 'DELETE') THEN
        v_action    := 'DELETE';
        v_old_data  := to_jsonb(OLD);
        v_new_data  := NULL;
        v_diff_data := NULL;
        v_record_id := (v_old_data ->> (TG_TABLE_NAME || '_id'))::BIGINT;
    END IF;

    INSERT INTO audit_logs (
        table_name, record_id, action,
        old_data, new_data, diff_data,
        changed_by, changed_at,
        ip_address, session_id
    ) VALUES (
        TG_TABLE_NAME, v_record_id, v_action,
        v_old_data, v_new_data, v_diff_data,
        v_changed_by, NOW(),
        inet_client_addr(),
        current_setting('app.session_id', true)
    );

    RETURN COALESCE(NEW, OLD);
END;
$$;
```

### 3-2. 트리거 부착

```sql
CREATE TRIGGER trg_audit_purchase_requests
    AFTER INSERT OR UPDATE OR DELETE ON purchase_requests
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE TRIGGER trg_audit_purchase_orders
    AFTER INSERT OR UPDATE OR DELETE ON purchase_orders
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE TRIGGER trg_audit_inventory
    AFTER INSERT OR UPDATE OR DELETE ON inventory
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE TRIGGER trg_audit_inventory_transfers
    AFTER INSERT OR UPDATE OR DELETE ON inventory_transfers
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE TRIGGER trg_audit_inventory_usages
    AFTER INSERT OR UPDATE OR DELETE ON inventory_usages
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE TRIGGER trg_audit_deliveries
    AFTER INSERT OR UPDATE OR DELETE ON deliveries
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();

CREATE TRIGGER trg_audit_employees
    AFTER INSERT OR UPDATE OR DELETE ON employees
    FOR EACH ROW EXECUTE FUNCTION fn_audit_trigger();
```

### 3-3. 재고 자동 갱신 트리거

```sql
-- 입고 완료 시 재고 증가
CREATE OR REPLACE FUNCTION fn_update_inventory_on_receiving()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO inventory (item_id, dept_id, location_code, qty_on_hand, last_updated_at)
        VALUES (
            NEW.item_id,
            (SELECT e.dept_id FROM receivings r
             JOIN purchase_orders po ON r.po_id = po.po_id
             JOIN employees e ON po.ordered_by = e.man_no
             WHERE r.recv_id = NEW.recv_id LIMIT 1),
            NEW.location_code,
            NEW.qty_received,
            NOW()
        )
        ON CONFLICT (item_id, dept_id, location_code)
        DO UPDATE SET
            qty_on_hand     = inventory.qty_on_hand + EXCLUDED.qty_on_hand,
            last_updated_at = NOW();
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_inv_on_receiving_line
    AFTER INSERT ON receiving_lines
    FOR EACH ROW EXECUTE FUNCTION fn_update_inventory_on_receiving();

-- 재고사용 즉시 차감 / 취소 시 복구
CREATE OR REPLACE FUNCTION fn_update_inventory_on_usage()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE inventory
        SET    qty_on_hand     = qty_on_hand - NEW.qty_used,
               last_updated_at = NOW()
        WHERE  inv_id = NEW.inv_id;
    ELSIF TG_OP = 'UPDATE' AND NEW.is_cancelled = TRUE AND OLD.is_cancelled = FALSE THEN
        UPDATE inventory
        SET    qty_on_hand     = qty_on_hand + OLD.qty_used,
               last_updated_at = NOW()
        WHERE  inv_id = NEW.inv_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_inv_on_usage
    AFTER INSERT OR UPDATE ON inventory_usages
    FOR EACH ROW EXECUTE FUNCTION fn_update_inventory_on_usage();

-- 납품 CONSUMED 전환 시 재고 차감
CREATE OR REPLACE FUNCTION fn_update_inventory_on_delivery_consumed()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF OLD.status <> 'CONSUMED' AND NEW.status = 'CONSUMED' THEN
        UPDATE inventory inv
        SET    qty_on_hand     = inv.qty_on_hand - dl.qty_delivered,
               last_updated_at = NOW()
        FROM   delivery_lines dl
        WHERE  dl.dlv_id = NEW.dlv_id
          AND  dl.inv_id = inv.inv_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_inv_on_delivery_consumed
    AFTER UPDATE ON deliveries
    FOR EACH ROW EXECUTE FUNCTION fn_update_inventory_on_delivery_consumed();
```

---

## 4. 인덱스 전략

```sql
-- employees
CREATE INDEX idx_employees_dept_id   ON employees (dept_id);
CREATE INDEX idx_employees_man_roll  ON employees (man_roll);
CREATE INDEX idx_employees_is_active ON employees (is_active) WHERE is_active = TRUE;

-- items
CREATE INDEX idx_items_category_id   ON items (category_id);
CREATE INDEX idx_items_is_active     ON items (is_active) WHERE is_active = TRUE;
CREATE INDEX idx_items_name_search   ON items USING gin (to_tsvector('simple', item_name));

-- purchase_requests
CREATE INDEX idx_pr_dept_status      ON purchase_requests (dept_id, status);
CREATE INDEX idx_pr_status           ON purchase_requests (status);
CREATE INDEX idx_pr_requested_at     ON purchase_requests (requested_at DESC NULLS LAST);
CREATE INDEX idx_pr_created_at       ON purchase_requests (created_at DESC);

-- purchase_request_lines
CREATE INDEX idx_prl_pr_id           ON purchase_request_lines (pr_id);
CREATE INDEX idx_prl_item_id         ON purchase_request_lines (item_id);

-- purchase_orders
CREATE INDEX idx_po_pr_id            ON purchase_orders (pr_id);
CREATE INDEX idx_po_status           ON purchase_orders (status);
CREATE INDEX idx_po_expected_at      ON purchase_orders (expected_at)
    WHERE status NOT IN ('FULLY_RECEIVED','CANCELLED');

-- purchase_order_lines
CREATE INDEX idx_pol_po_id           ON purchase_order_lines (po_id);
CREATE INDEX idx_pol_item_id         ON purchase_order_lines (item_id);

-- receivings
CREATE INDEX idx_recv_po_id          ON receivings (po_id);
CREATE INDEX idx_recv_status         ON receivings (status);

-- inventory
CREATE INDEX idx_inv_dept_id         ON inventory (dept_id);
CREATE INDEX idx_inv_item_id         ON inventory (item_id);
CREATE INDEX idx_inv_dept_item       ON inventory (dept_id, item_id);
CREATE INDEX idx_inv_low_stock       ON inventory (dept_id, item_id, qty_on_hand)
    WHERE qty_on_hand < 10;

-- inventory_transfers
CREATE INDEX idx_trf_status          ON inventory_transfers (status);
CREATE INDEX idx_trf_item_status     ON inventory_transfers (item_id, status);
CREATE INDEX idx_trf_created_at      ON inventory_transfers (created_at DESC);

-- inventory_usages
CREATE INDEX idx_usage_dept_date     ON inventory_usages (dept_id, used_at DESC);
CREATE INDEX idx_usage_item_date     ON inventory_usages (item_id, used_at DESC);
CREATE INDEX idx_usage_not_cancelled ON inventory_usages (dept_id, used_at DESC)
    WHERE is_cancelled = FALSE;

-- deliveries
CREATE INDEX idx_dlv_dept_status     ON deliveries (dept_id, status);
CREATE INDEX idx_dlv_status          ON deliveries (status);

-- delivery_lines
CREATE INDEX idx_dlvl_dlv_id         ON delivery_lines (dlv_id);
CREATE INDEX idx_dlvl_inv_id         ON delivery_lines (inv_id);

-- audit_logs
CREATE INDEX idx_audit_table_record  ON audit_logs (table_name, record_id);
CREATE INDEX idx_audit_changed_by    ON audit_logs (changed_by);
CREATE INDEX idx_audit_changed_at    ON audit_logs (changed_at DESC);
CREATE INDEX idx_audit_new_data_gin  ON audit_logs USING gin (new_data jsonb_path_ops);
CREATE INDEX idx_audit_old_data_gin  ON audit_logs USING gin (old_data jsonb_path_ops);
```

### 파티셔닝 전략 요약

| 테이블 | 파티션 기준 | 단위 | 비고 |
|---|---|---|---|
| `audit_logs` | `changed_at` | 월별 RANGE | 우선 적용 |
| `inventory_usages` | `used_at` | 분기별 RANGE | 1,000만 건 초과 시 |
| `purchase_requests` | `created_at` | 연도별 RANGE | 초기에는 단일 테이블 |

---

## 5. 마이그레이션 스크립트

### 5-1. 생성 순서 (V001__init_schema.sql)

```
1. ENUM 타입
2. departments → item_categories → items
3. employees
4. purchase_requests → purchase_request_lines
5. purchase_orders → purchase_order_lines
6. receivings → receiving_lines
7. inventory → inventory_transfers → inventory_usages
8. deliveries → delivery_lines
9. audit_logs (파티션 포함)
10. 인덱스
11. 트리거 함수 + 트리거
```

### 5-2. 시드 데이터 (V002__seed_data.sql)

```sql
BEGIN;

-- 부서 마스터
INSERT INTO departments (dept_code, dept_name, parent_id, dept_level) VALUES
    ('ROOT',   'HQ',           NULL, 1),
    ('MGMT',   '경영지원팀',    1,    2),
    ('BIZ',    '사업본부',      1,    1),
    ('RND',    '연구소',        1,    1);

-- 사업본부 소속팀 (예시)
INSERT INTO departments (dept_code, dept_name, parent_id, dept_level)
SELECT dept_code, dept_name,
       (SELECT dept_id FROM departments WHERE dept_code = 'BIZ'), 2
FROM (VALUES
    ('SALES',  '영업팀'),
    ('PM',     'PM팀')
) AS t(dept_code, dept_name);

-- 연구소 소속팀 (예시)
INSERT INTO departments (dept_code, dept_name, parent_id, dept_level)
SELECT dept_code, dept_name,
       (SELECT dept_id FROM departments WHERE dept_code = 'RND'), 2
FROM (VALUES
    ('DEV',    '개발팀'),
    ('INFRA',  '인프라팀'),
    ('QA',     'QA팀')
) AS t(dept_code, dept_name);

-- 품목 분류
INSERT INTO item_categories (category_code, category_name) VALUES
    ('OFFICE',   '사무용품'),
    ('IT',       'IT장비'),
    ('FACILITY', '시설/비품'),
    ('CONSUME',  '소모품');

-- 마스터 계정 (man_roll = '2')
INSERT INTO employees (man_id, man_name, man_roll, dept_id)
VALUES ('admin', '시스템관리자', '2',
        (SELECT dept_id FROM departments WHERE dept_code = 'MGMT'));

COMMIT;
```

### 5-3. 문서번호 채번 함수

```sql
CREATE OR REPLACE FUNCTION fn_generate_doc_no(p_prefix TEXT)
RETURNS TEXT LANGUAGE plpgsql AS $$
DECLARE
    v_date     TEXT := TO_CHAR(NOW(), 'YYYYMMDD');
    v_seq      BIGINT;
    v_seq_name TEXT := 'seq_' || lower(p_prefix) || '_daily';
BEGIN
    EXECUTE format('SELECT nextval(%L)', v_seq_name) INTO v_seq;
    RETURN p_prefix || '-' || v_date || '-' || LPAD(v_seq::TEXT, 4, '0');
END;
$$;
-- 사용 예: SELECT fn_generate_doc_no('PR'); → 'PR-20260402-0001'
```

---

## 6. 주요 쿼리 예시

### 6-1. 팀별 재고 현황

```sql
SELECT
    d.dept_name        AS 팀명,
    ic.category_name   AS 품목분류,
    i.item_code        AS 품목코드,
    i.item_name        AS 품목명,
    i.unit             AS 단위,
    inv.location_code  AS 위치,
    inv.qty_on_hand    AS 현재고,
    inv.qty_reserved   AS 예약수량,
    inv.qty_available  AS 가용수량,
    ROUND(inv.qty_on_hand * i.unit_price, 0) AS 재고금액,
    inv.last_updated_at AS 최종갱신
FROM inventory inv
JOIN items          i   ON inv.item_id    = i.item_id
JOIN departments    d   ON inv.dept_id    = d.dept_id
LEFT JOIN item_categories ic ON i.category_id = ic.category_id
WHERE inv.qty_on_hand > 0
ORDER BY d.dept_name, ic.category_name, i.item_name;
```

### 6-2. 구매요청 상태별 집계

```sql
SELECT
    status    AS 상태,
    COUNT(*)  AS 건수,
    SUM(total_amount) AS 합계금액
FROM purchase_requests
GROUP BY status
ORDER BY CASE status
    WHEN 'DRAFT'     THEN 1 WHEN 'PENDING'  THEN 2
    WHEN 'APPROVED'  THEN 3 WHEN 'ORDERED'  THEN 4
    WHEN 'RECEIVED'  THEN 5 WHEN 'CANCELLED' THEN 6
END;

-- 장기 미결 (PENDING 7일 초과)
SELECT pr.pr_no, pr.title, d.dept_name, e.man_name,
       pr.total_amount,
       EXTRACT(DAY FROM NOW() - pr.requested_at)::INT AS 경과일수
FROM purchase_requests pr
JOIN departments d ON pr.dept_id      = d.dept_id
JOIN employees   e ON pr.requester_id = e.man_no
WHERE pr.status = 'PENDING'
  AND pr.requested_at < NOW() - INTERVAL '7 days'
ORDER BY pr.requested_at ASC;
```

### 6-3. 변경 이력 조회

```sql
-- 특정 구매요청 이력
SELECT
    al.action,
    al.old_data ->> 'status'  AS 변경전_상태,
    al.new_data ->> 'status'  AS 변경후_상태,
    al.diff_data              AS 변경내용,
    e.man_name                AS 처리자,
    al.changed_at             AS 처리일시
FROM audit_logs al
LEFT JOIN employees e ON al.changed_by = e.man_no
WHERE al.table_name = 'purchase_requests'
  AND al.record_id  = :pr_id
ORDER BY al.changed_at ASC;

-- 재고 수량 변동 타임라인
SELECT
    al.changed_at,
    (al.old_data ->> 'qty_on_hand')::NUMERIC  AS 변경전_수량,
    (al.new_data ->> 'qty_on_hand')::NUMERIC  AS 변경후_수량,
    (al.new_data ->> 'qty_on_hand')::NUMERIC
        - (al.old_data ->> 'qty_on_hand')::NUMERIC AS 변동량,
    e.man_name AS 처리자
FROM audit_logs al
LEFT JOIN employees e ON al.changed_by = e.man_no
WHERE al.table_name = 'inventory'
  AND al.record_id  = :inv_id
  AND al.action     = 'UPDATE'
  AND (al.diff_data ? 'qty_on_hand')
ORDER BY al.changed_at ASC;
```

---

## 설계 핵심 원칙 요약

| 항목 | 결정사항 |
|---|---|
| DB 엔진 | PostgreSQL 15+ |
| 이력 방식 | DB 트리거 + JSONB diff 저장 |
| 재고 갱신 | 트리거 기반 즉시 반영 |
| 파티셔닝 | audit_logs 월별 RANGE, pg_partman 권장 |
| 번호 채번 | fn_generate_doc_no() + 일별 시퀀스 |
| 권한 검증 | man_roll은 애플리케이션 레벨에서 최종 검증 |
| 재고 음수 방지 | CHECK 제약조건 + 트리거 이중 방어 |
