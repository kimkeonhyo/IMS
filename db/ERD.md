# IMS - Entity Relationship Diagram

## ERD (Mermaid)

```mermaid
erDiagram
    Employee {
        string id PK
        string man_no UK "직번"
        string man_id UK "로그인ID"
        string name
        string password
        Role man_roll "MASTER/ADMIN/USER"
        Team man_team "소속팀"
        string email
        string phone
        boolean is_active
        datetime created_at
        datetime updated_at
    }

    Item {
        string id PK
        string name "품목명"
        string code UK "품목코드"
        string description
        string unit "단위(EA/BOX/SET)"
        datetime created_at
        datetime updated_at
    }

    Inventory {
        string id PK
        string item_id FK
        int quantity "수량"
        string location "보관장소"
        datetime created_at
        datetime updated_at
    }

    PurchaseRequest {
        string id PK
        string request_no UK "요청번호"
        PurchaseRequestStatus status "DRAFT~RECEIVED"
        string requester_id FK
        string approver_id FK
        string title
        string description
        datetime approved_at
        datetime created_at
        datetime updated_at
    }

    PurchaseRequestItem {
        string id PK
        string purchase_request_id FK
        string item_id FK
        int quantity
        decimal unit_price
        string note
        datetime created_at
        datetime updated_at
    }

    PurchaseOrder {
        string id PK
        string order_no UK "발주번호"
        string purchase_request_id FK,UK
        PurchaseOrderStatus status "PENDING~CANCELLED"
        string ordered_by_id FK
        string supplier "공급업체"
        decimal total_amount
        datetime ordered_at
        datetime expected_date "입고예정일"
        datetime created_at
        datetime updated_at
    }

    PurchaseOrderItem {
        string id PK
        string purchase_order_id FK
        string item_id FK
        int quantity
        decimal unit_price
        datetime created_at
        datetime updated_at
    }

    StockReceipt {
        string id PK
        string receipt_no UK "입고번호"
        string purchase_order_id FK
        string received_by_id FK
        string location "입고보관장소"
        datetime received_at
        string note
        datetime created_at
        datetime updated_at
    }

    StockReceiptItem {
        string id PK
        string stock_receipt_id FK
        string item_id FK
        int quantity "실제입고수량"
        datetime created_at
        datetime updated_at
    }

    StockMovement {
        string id PK
        string movement_no UK "이동번호"
        StockMovementStatus status "PENDING~MOVED"
        string item_id FK
        int quantity
        string from_location
        string to_location
        string reason "사유(필수)"
        string created_by_id FK
        string approved_by_id FK
        datetime approved_at
        datetime moved_at
        datetime created_at
        datetime updated_at
    }

    Delivery {
        string id PK
        string delivery_no UK "납품번호"
        DeliveryStatus status "PENDING~CONSUMED"
        string destination "납품처"
        string created_by_id FK
        string approved_by_id FK
        datetime approved_at
        datetime delivered_at
        datetime consumed_at "재고소진반영시점"
        string note
        datetime created_at
        datetime updated_at
    }

    DeliveryItem {
        string id PK
        string delivery_id FK
        string item_id FK
        int quantity
        string location "출고보관장소"
        datetime created_at
        datetime updated_at
    }

    StockUsage {
        string id PK
        string usage_no UK "사용번호"
        string item_id FK
        int quantity
        string location "출고보관장소"
        string reason "사유(필수)"
        string used_by_id FK
        boolean is_cancelled
        string cancelled_by_id FK "마스터만가능"
        datetime cancelled_at
        string cancel_reason
        datetime created_at
        datetime updated_at
    }

    AuditLog {
        string id PK
        AuditAction action "CREATE/UPDATE/DELETE/STATUS_CHANGE"
        string table_name "대상테이블"
        string record_id "대상레코드ID"
        string field "변경된필드"
        string old_value "이전값"
        string new_value "변경값"
        string performed_by_id FK "처리자"
        datetime performed_at "타임스탬프"
        datetime created_at
        datetime updated_at
    }

    %% ── Relations ──

    Employee ||--o{ PurchaseRequest : "요청자"
    Employee ||--o{ PurchaseRequest : "승인자"
    Employee ||--o{ PurchaseOrder : "발주자"
    Employee ||--o{ StockReceipt : "입고처리자"
    Employee ||--o{ StockMovement : "생성자"
    Employee ||--o{ StockMovement : "승인자"
    Employee ||--o{ Delivery : "생성자"
    Employee ||--o{ Delivery : "승인자"
    Employee ||--o{ StockUsage : "사용자"
    Employee ||--o{ StockUsage : "취소자"
    Employee ||--o{ AuditLog : "처리자"

    Item ||--o{ Inventory : "보유"
    Item ||--o{ PurchaseRequestItem : "요청품목"
    Item ||--o{ PurchaseOrderItem : "발주품목"
    Item ||--o{ StockReceiptItem : "입고품목"
    Item ||--o{ StockMovement : "이동품목"
    Item ||--o{ DeliveryItem : "납품품목"
    Item ||--o{ StockUsage : "사용품목"

    PurchaseRequest ||--o{ PurchaseRequestItem : "포함"
    PurchaseRequest ||--o| PurchaseOrder : "발주생성"

    PurchaseOrder ||--o{ PurchaseOrderItem : "포함"
    PurchaseOrder ||--o{ StockReceipt : "입고"

    StockReceipt ||--o{ StockReceiptItem : "포함"

    Delivery ||--o{ DeliveryItem : "포함"
```

## 테이블 설명

### 사용자/권한

| 테이블 | 설명 |
|--------|------|
| **Employee** | 직원 정보. 직번(man_no), 로그인ID(man_id), 역할(MASTER/ADMIN/USER), 소속팀을 관리. 경영지원팀은 전체 데이터 접근, 나머지 팀은 소속 팀 데이터만 접근 |

### 마스터 데이터

| 테이블 | 설명 |
|--------|------|
| **Item** | 품목 마스터. 품목코드, 품목명, 단위 등 품목의 기본 정보 관리 |
| **Inventory** | 재고 현황. 품목별, 보관장소별 현재 수량 관리. (item_id + location) 복합 유니크 |

### Flow 1: 구매 Flow

| 테이블 | 설명 |
|--------|------|
| **PurchaseRequest** | 구매요청. DRAFT -> PENDING -> APPROVED -> ORDERED -> RECEIVED 상태 흐름 |
| **PurchaseRequestItem** | 구매요청 품목. 구매요청에 포함된 개별 품목과 수량 |
| **PurchaseOrder** | 발주. 구매요청 승인 후 생성되며 1:1 관계. 공급업체, 총금액 등 관리 |
| **PurchaseOrderItem** | 발주 품목. 발주에 포함된 개별 품목, 수량, 단가 |
| **StockReceipt** | 입고. 발주 후 실제 물품 입고 처리. 입고 보관장소 지정 |
| **StockReceiptItem** | 입고 품목. 실제 입고된 품목별 수량 |

### Flow 2: 재고이동 Flow

| 테이블 | 설명 |
|--------|------|
| **StockMovement** | 재고이동. PENDING -> APPROVED -> MOVED 상태 흐름. 출발지/목적지, 사유 필수 |

### Flow 3: 납품 Flow

| 테이블 | 설명 |
|--------|------|
| **Delivery** | 납품. PENDING -> IN_PROGRESS -> DELIVERED -> APPROVED -> CONSUMED 상태 흐름. 승인 후 재고 소진 반영 |
| **DeliveryItem** | 납품 품목. 납품에 포함된 개별 품목, 수량, 출고 보관장소 |

### Flow 4: 재고사용 Flow

| 테이블 | 설명 |
|--------|------|
| **StockUsage** | 재고사용. 승인 없이 즉시 재고 차감. 사유 필수, 취소는 마스터(MASTER) 역할만 가능 |

### 공통

| 테이블 | 설명 |
|--------|------|
| **AuditLog** | 감사 로그. 모든 변경 이력 추적. 처리자, 타임스탬프, 대상 테이블/레코드, 이전값/변경값 기록 |

## 상태 흐름도

### 구매요청 (PurchaseRequest)
```
DRAFT → PENDING → APPROVED → ORDERED → RECEIVED
```

### 발주 (PurchaseOrder)
```
PENDING → CONFIRMED → SHIPPED → RECEIVED
                                     ↘ CANCELLED (언제든 취소 가능)
```

### 재고이동 (StockMovement)
```
PENDING → APPROVED → MOVED
```

### 납품 (Delivery)
```
PENDING → IN_PROGRESS → DELIVERED → APPROVED → CONSUMED
```
- APPROVED 이후 재고 소진(차감) 반영

### 재고사용 (StockUsage)
```
생성 즉시 재고 차감 (승인 불필요)
취소: 마스터(MASTER) 권한만 가능
```
