CREATE TABLE `employees` (
	`man_no`	VARCHAR(20)	NOT NULL	COMMENT '사번',
	`man_id`	VARCHAR(50)	NOT NULL	COMMENT '로그인 ID',
	`name`	VARCHAR(100)	NOT NULL	COMMENT '이름',
	`password`	VARCHAR(255)	NOT NULL	COMMENT '비밀번호(해시)',
	`man_roll`	VARCHAR(10)	NOT NULL	COMMENT '역할: MASTER(0)/ADMIN(1)/USER(2)',
	`man_team`	VARCHAR(50)	NOT NULL	COMMENT '소속팀',
	`email`	VARCHAR(200)	NULL	COMMENT '이메일',
	`phone`	VARCHAR(30)	NULL	COMMENT '연락처',
	`is_active`	TINYINT(1)	NOT NULL	DEFAULT 1	COMMENT '활성여부',
	`created_at`	DATETIME	NOT NULL,
	`updated_at`	DATETIME	NOT NULL
);

CREATE TABLE `Storage` (
	`storage_code`	VARCHAR(36)	NOT NULL	COMMENT 'PK',
	`storage_name`	VARCHAR(100)	NOT NULL	COMMENT '보관소명',
	`storage_status`	TINYINT(1)	NOT NULL	DEFAULT 1	COMMENT '0:비활성, 1:활성',
	`created_at`	DATETIME	NOT NULL,
	`updated_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '수정일'
);

CREATE TABLE `inventory` (
	`storage_code`	VARCHAR(36)	NOT NULL	COMMENT 'FK → Storage',
	`item_code`	VARCHAR(50)	NOT NULL	COMMENT 'FK → items',
	`quantity`	INT	NOT NULL	DEFAULT 0	COMMENT '현재 수량',
	`created_at`	DATETIME	NOT NULL,
	`updated_at`	DATETIME	NOT NULL
);

CREATE TABLE `items` (
	`item_code`	VARCHAR(50)	NOT NULL	COMMENT '품목코드',
	`item_name`	VARCHAR(200)	NOT NULL	COMMENT '품목명',
	`description`	TEXT	NULL	COMMENT '설명',
	`unit`	VARCHAR(20)	NOT NULL	DEFAULT 'EA'	COMMENT '단위(EA/BOX/SET)',
	`unit_price`	DECIMAL(15, 2)	NULL	DEFAULT 0	COMMENT '단가',
	`is_active`	TINYINT(1)	NOT NULL	DEFAULT 1	COMMENT '활성여부',
	`created_at`	DATETIME	NOT NULL,
	`updated_at`	DATETIME	NOT NULL
);

CREATE TABLE `purchase_requests` (
	`request_id`	VARCHAR(30)	NOT NULL	COMMENT '요청번호 (예: PR-20260402-0001)',
	`status`	VARCHAR(20)	NOT NULL	DEFAULT 'DRAFT'	COMMENT '상태: DRAFT / PENDING / APPROVED / ORDERED / RECEIVED / CANCELLED',
	`title`	VARCHAR(300)	NOT NULL	COMMENT '요청 제목',
	`description`	TEXT	NULL	COMMENT '요청 상세',
	`cancel_reason`	TEXT	NULL	COMMENT '취소 사유 (PENDING 이하만 취소 가능)',
	`approved_at`	DATETIME	NULL	COMMENT '승인 일시',
	`cancelled_at`	DATETIME	NULL	COMMENT '취소 일시',
	`created_at`	DATETIME	NOT NULL,
	`updated_at`	DATETIME	NOT NULL,
	`request_man_no`	VARCHAR(20)	NOT NULL	COMMENT '구매요청자',
	`approved_man_no`	VARCHAR(20)	NULL	COMMENT '구매승인자 (승인 전 NULL)'
);

CREATE TABLE `purchase_request_items` (
	`request_item_id`	VARCHAR(36)	NOT NULL	COMMENT 'PK',
	`request_id`	VARCHAR(30)	NOT NULL	COMMENT '요청번호 (예: PR-20260402-0001)',
	`quantity`	INT	NOT NULL	COMMENT '요청 수량',
	`unit_price`	DECIMAL(15, 2)	NOT NULL	DEFAULT 0	COMMENT '예상 단가',
	`note`	TEXT	NULL	COMMENT '비고',
	`created_at`	DATETIME	NOT NULL,
	`updated_at`	DATETIME	NOT NULL,
	`item_code`	VARCHAR(50)	NOT NULL	COMMENT '품목코드'
);

CREATE TABLE `purchase_orders` (
	`order_id`	VARCHAR(30)	NOT NULL	COMMENT '발주번호 (예: PO-20260402-0001)',
	`status`	VARCHAR(20)	NOT NULL	DEFAULT 'PENDING'	COMMENT '상태: PENDING / CONFIRMED / SHIPPED / RECEIVED / CANCELLED',
	`supplier`	VARCHAR(200)	NOT NULL	COMMENT '공급업체명',
	`total_amount`	DECIMAL(15, 2)	NOT NULL	DEFAULT 0	COMMENT '발주 총액',
	`ordered_at`	DATETIME	NULL	COMMENT '발주 일시',
	`expected_date`	DATE	NULL	COMMENT '입고 예정일',
	`note`	TEXT	NULL	COMMENT '비고',
	`created_at`	DATETIME	NOT NULL,
	`updated_at`	DATETIME	NOT NULL,
	`request_id`	VARCHAR(30)	NOT NULL	COMMENT '요청번호 (예: PR-20260402-0001)',
	`order_man_no`	VARCHAR(20)	NOT NULL	COMMENT '발주담당자'
);

CREATE TABLE `purchase_order_items` (
	`order_item_id`	VARCHAR(36)	NOT NULL	COMMENT 'PK',
	`order_id`	VARCHAR(30)	NOT NULL	COMMENT '발주번호 (예: PO-20260402-0001)',
	`quantity`	INT	NOT NULL	COMMENT '발주 수량',
	`unit_price`	DECIMAL(15, 2)	NOT NULL	DEFAULT 0	COMMENT '발주 단가',
	`created_at`	DATETIME	NOT NULL,
	`updated_at`	DATETIME	NOT NULL,
	`storage_code`	VARCHAR(36)	NOT NULL	COMMENT '입고 예정 보관소',
	`item_code`	VARCHAR(50)	NOT NULL	COMMENT '품목코드'
);

CREATE TABLE `store` (
	`store_id`	VARCHAR(36)	NOT NULL	COMMENT 'PK',
	`received_at`	DATETIME	NULL	COMMENT '입고 일시',
	`note`	TEXT	NULL	COMMENT '비고',
	`created_at`	DATETIME	NOT NULL,
	`updated_at`	DATETIME	NOT NULL,
	`order_man_no`	VARCHAR(20)	NOT NULL	COMMENT '입고담당자',
	`order_id`	VARCHAR(30)	NOT NULL	COMMENT '발주번호 (예: PO-20260402-0001)'
);

CREATE TABLE `stock_receipt_items` (
	`store_item_id`	VARCHAR(36)	NOT NULL	COMMENT 'PK',
	`store_id`	VARCHAR(36)	NOT NULL	COMMENT 'FK → store',
	`quantity`	INT	NOT NULL	COMMENT '실제 입고 수량',
	`created_at`	DATETIME	NOT NULL,
	`updated_at`	DATETIME	NOT NULL,
	`storage_code`	VARCHAR(36)	NOT NULL	COMMENT '실제 입고 보관소',
	`item_code`	VARCHAR(50)	NOT NULL	COMMENT '품목코드'
);

CREATE TABLE `stock_movements` (
	`movement_no`	VARCHAR(30)	NOT NULL	COMMENT '이동번호 (예: TRF-20260402-0001)',
	`status`	VARCHAR(20)	NOT NULL	DEFAULT 'PENDING'	COMMENT '상태: PENDING / APPROVED / MOVED / CANCELLED',
	`quantity`	INT	NOT NULL	COMMENT '이동 수량',
	`reason`	TEXT	NOT NULL	COMMENT '이동 사유 (필수)',
	`approved_at`	DATETIME	NULL	COMMENT '승인 일시',
	`moved_at`	DATETIME	NULL	COMMENT '이동 완료 일시',
	`created_at`	DATETIME	NOT NULL,
	`updated_at`	DATETIME	NOT NULL,
	`move_man_no`	VARCHAR(20)	NOT NULL	COMMENT '재고이동신청자(인계자)',
	`approved_man_no`	VARCHAR(20)	NULL	COMMENT '재고이동승인자(인수부서팀장) (승인 전 NULL)',
	`from_storage_code`	VARCHAR(36)	NOT NULL	COMMENT '출발 보관소',
	`to_storage_code`	VARCHAR(36)	NOT NULL	COMMENT '도착 보관소',
	`item_code`	VARCHAR(50)	NOT NULL	COMMENT '품목코드'
);

CREATE TABLE `deliveries` (
	`delivery_no`	VARCHAR(30)	NOT NULL	COMMENT '납품번호 (예: DLV-20260402-0001)',
	`status`	VARCHAR(20)	NOT NULL	DEFAULT 'PENDING'	COMMENT '상태: PENDING / IN_PROGRESS / DELIVERED / APPROVED / CONSUMED',
	`destination`	VARCHAR(300)	NOT NULL	COMMENT '납품처',
	`approved_at`	DATETIME	NULL	COMMENT '승인 일시',
	`delivered_at`	DATETIME	NULL	COMMENT '납품 완료 일시',
	`note`	TEXT	NULL	COMMENT '비고',
	`created_at`	DATETIME	NOT NULL,
	`updated_at`	DATETIME	NOT NULL,
	`delivery_man_no`	VARCHAR(20)	NOT NULL	COMMENT '납품자',
	`approved_man_no`	VARCHAR(20)	NULL	COMMENT '납품승인자 (승인 전 NULL)'
);

CREATE TABLE `delivery_items` (
	`delivery_item_id`	VARCHAR(36)	NOT NULL	COMMENT 'PK',
	`delivery_no`	VARCHAR(30)	NOT NULL	COMMENT '납품번호 (예: DLV-20260402-0001)',
	`quantity`	INT	NOT NULL	COMMENT '납품 수량',
	`created_at`	DATETIME	NOT NULL,
	`updated_at`	DATETIME	NOT NULL,
	`storage_code`	VARCHAR(36)	NOT NULL	COMMENT '출고 보관소',
	`item_code`	VARCHAR(50)	NOT NULL	COMMENT '품목코드'
);

CREATE TABLE `stock_usages` (
	`usage_no`	VARCHAR(30)	NOT NULL	COMMENT '사용번호 (예: USE-20260402-0001)',
	`quantity`	INT	NOT NULL	COMMENT '사용 수량',
	`reason`	TEXT	NOT NULL	COMMENT '사용 사유 (필수)',
	`is_cancelled`	TINYINT(1)	NOT NULL	DEFAULT 0	COMMENT '취소 여부',
	`cancelled_at`	DATETIME	NULL	COMMENT '취소 일시',
	`cancel_reason`	TEXT	NULL	COMMENT '취소 사유',
	`created_at`	DATETIME	NOT NULL,
	`updated_at`	DATETIME	NOT NULL,
	`use_man_no`	VARCHAR(20)	NOT NULL	COMMENT '사용자',
	`cancel_man_no`	VARCHAR(20)	NULL	COMMENT '취소자 (MASTER만 가능, 취소 전 NULL)',
	`storage_code`	VARCHAR(36)	NOT NULL	COMMENT '출고 보관소',
	`item_code`	VARCHAR(50)	NOT NULL	COMMENT '품목코드'
);

CREATE TABLE `audit_logs` (
	`log_id`	BIGINT	NOT NULL	AUTO_INCREMENT	COMMENT 'PK',
	`man_no`	VARCHAR(20)	NOT NULL	COMMENT '처리자',
	`action`	VARCHAR(30)	NOT NULL	COMMENT '작업 유형: CREATE/UPDATE/DELETE/STATUS_CHANGE',
	`table_name`	VARCHAR(100)	NOT NULL	COMMENT '대상 테이블명',
	`field`	VARCHAR(100)	NULL	COMMENT '변경된 필드명',
	`old_value`	TEXT	NULL	COMMENT '이전 값',
	`new_value`	TEXT	NULL	COMMENT '변경 후 값',
	`performed_at`	DATETIME	NOT NULL	DEFAULT CURRENT_TIMESTAMP	COMMENT '처리 일시',
	`ip_address`	VARCHAR(45)	NULL	COMMENT '처리자 IP',
	`created_at`	DATETIME	NOT NULL
);

ALTER TABLE `employees` ADD CONSTRAINT `PK_EMPLOYEES` PRIMARY KEY (
	`man_no`
);

ALTER TABLE `Storage` ADD CONSTRAINT `PK_STORAGE` PRIMARY KEY (
	`storage_code`
);

ALTER TABLE `inventory` ADD CONSTRAINT `PK_INVENTORY` PRIMARY KEY (
	`storage_code`,
	`item_code`
);

ALTER TABLE `items` ADD CONSTRAINT `PK_ITEMS` PRIMARY KEY (
	`item_code`
);

ALTER TABLE `purchase_requests` ADD CONSTRAINT `PK_PURCHASE_REQUESTS` PRIMARY KEY (
	`request_id`
);

ALTER TABLE `purchase_request_items` ADD CONSTRAINT `PK_PURCHASE_REQUEST_ITEMS` PRIMARY KEY (
	`request_item_id`
);

ALTER TABLE `purchase_orders` ADD CONSTRAINT `PK_PURCHASE_ORDERS` PRIMARY KEY (
	`order_id`
);

ALTER TABLE `purchase_order_items` ADD CONSTRAINT `PK_PURCHASE_ORDER_ITEMS` PRIMARY KEY (
	`order_item_id`
);

ALTER TABLE `store` ADD CONSTRAINT `PK_STORE` PRIMARY KEY (
	`store_id`
);

ALTER TABLE `stock_receipt_items` ADD CONSTRAINT `PK_STOCK_RECEIPT_ITEMS` PRIMARY KEY (
	`store_item_id`
);

ALTER TABLE `stock_movements` ADD CONSTRAINT `PK_STOCK_MOVEMENTS` PRIMARY KEY (
	`movement_no`
);

ALTER TABLE `deliveries` ADD CONSTRAINT `PK_DELIVERIES` PRIMARY KEY (
	`delivery_no`
);

ALTER TABLE `delivery_items` ADD CONSTRAINT `PK_DELIVERY_ITEMS` PRIMARY KEY (
	`delivery_item_id`
);

ALTER TABLE `stock_usages` ADD CONSTRAINT `PK_STOCK_USAGES` PRIMARY KEY (
	`usage_no`
);

ALTER TABLE `audit_logs` ADD CONSTRAINT `PK_AUDIT_LOGS` PRIMARY KEY (
	`log_id`
);

ALTER TABLE `inventory` ADD CONSTRAINT `FK_Storage_TO_inventory_1` FOREIGN KEY (
	`storage_code`
)
REFERENCES `Storage` (
	`storage_code`
);

ALTER TABLE `inventory` ADD CONSTRAINT `FK_items_TO_inventory_1` FOREIGN KEY (
	`item_code`
)
REFERENCES `items` (
	`item_code`
);

ALTER TABLE `purchase_requests` ADD CONSTRAINT `FK_employees_TO_purchase_requests_1` FOREIGN KEY (
	`request_man_no`
)
REFERENCES `employees` (
	`man_no`
);

ALTER TABLE `purchase_requests` ADD CONSTRAINT `FK_employees_TO_purchase_requests_2` FOREIGN KEY (
	`approved_man_no`
)
REFERENCES `employees` (
	`man_no`
);

ALTER TABLE `purchase_request_items` ADD CONSTRAINT `FK_purchase_requests_TO_purchase_request_items_1` FOREIGN KEY (
	`request_id`
)
REFERENCES `purchase_requests` (
	`request_id`
);

ALTER TABLE `purchase_request_items` ADD CONSTRAINT `FK_items_TO_purchase_request_items_1` FOREIGN KEY (
	`item_code`
)
REFERENCES `items` (
	`item_code`
);

ALTER TABLE `purchase_orders` ADD CONSTRAINT `FK_purchase_requests_TO_purchase_orders_1` FOREIGN KEY (
	`request_id`
)
REFERENCES `purchase_requests` (
	`request_id`
);

ALTER TABLE `purchase_orders` ADD CONSTRAINT `FK_employees_TO_purchase_orders_1` FOREIGN KEY (
	`order_man_no`
)
REFERENCES `employees` (
	`man_no`
);

ALTER TABLE `purchase_order_items` ADD CONSTRAINT `FK_purchase_orders_TO_purchase_order_items_1` FOREIGN KEY (
	`order_id`
)
REFERENCES `purchase_orders` (
	`order_id`
);

ALTER TABLE `purchase_order_items` ADD CONSTRAINT `FK_Storage_TO_purchase_order_items_1` FOREIGN KEY (
	`storage_code`
)
REFERENCES `Storage` (
	`storage_code`
);

ALTER TABLE `purchase_order_items` ADD CONSTRAINT `FK_items_TO_purchase_order_items_1` FOREIGN KEY (
	`item_code`
)
REFERENCES `items` (
	`item_code`
);

ALTER TABLE `store` ADD CONSTRAINT `FK_purchase_orders_TO_store_1` FOREIGN KEY (
	`order_id`
)
REFERENCES `purchase_orders` (
	`order_id`
);

ALTER TABLE `store` ADD CONSTRAINT `FK_employees_TO_store_1` FOREIGN KEY (
	`order_man_no`
)
REFERENCES `employees` (
	`man_no`
);

ALTER TABLE `stock_receipt_items` ADD CONSTRAINT `FK_store_TO_stock_receipt_items_1` FOREIGN KEY (
	`store_id`
)
REFERENCES `store` (
	`store_id`
);

ALTER TABLE `stock_receipt_items` ADD CONSTRAINT `FK_Storage_TO_stock_receipt_items_1` FOREIGN KEY (
	`storage_code`
)
REFERENCES `Storage` (
	`storage_code`
);

ALTER TABLE `stock_receipt_items` ADD CONSTRAINT `FK_items_TO_stock_receipt_items_1` FOREIGN KEY (
	`item_code`
)
REFERENCES `items` (
	`item_code`
);

ALTER TABLE `stock_movements` ADD CONSTRAINT `FK_employees_TO_stock_movements_1` FOREIGN KEY (
	`move_man_no`
)
REFERENCES `employees` (
	`man_no`
);

ALTER TABLE `stock_movements` ADD CONSTRAINT `FK_employees_TO_stock_movements_2` FOREIGN KEY (
	`approved_man_no`
)
REFERENCES `employees` (
	`man_no`
);

ALTER TABLE `stock_movements` ADD CONSTRAINT `FK_Storage_TO_stock_movements_1` FOREIGN KEY (
	`from_storage_code`
)
REFERENCES `Storage` (
	`storage_code`
);

ALTER TABLE `stock_movements` ADD CONSTRAINT `FK_Storage_TO_stock_movements_2` FOREIGN KEY (
	`to_storage_code`
)
REFERENCES `Storage` (
	`storage_code`
);

ALTER TABLE `stock_movements` ADD CONSTRAINT `FK_items_TO_stock_movements_1` FOREIGN KEY (
	`item_code`
)
REFERENCES `items` (
	`item_code`
);

ALTER TABLE `deliveries` ADD CONSTRAINT `FK_employees_TO_deliveries_1` FOREIGN KEY (
	`delivery_man_no`
)
REFERENCES `employees` (
	`man_no`
);

ALTER TABLE `deliveries` ADD CONSTRAINT `FK_employees_TO_deliveries_2` FOREIGN KEY (
	`approved_man_no`
)
REFERENCES `employees` (
	`man_no`
);

ALTER TABLE `delivery_items` ADD CONSTRAINT `FK_deliveries_TO_delivery_items_1` FOREIGN KEY (
	`delivery_no`
)
REFERENCES `deliveries` (
	`delivery_no`
);

ALTER TABLE `delivery_items` ADD CONSTRAINT `FK_Storage_TO_delivery_items_1` FOREIGN KEY (
	`storage_code`
)
REFERENCES `Storage` (
	`storage_code`
);

ALTER TABLE `delivery_items` ADD CONSTRAINT `FK_items_TO_delivery_items_1` FOREIGN KEY (
	`item_code`
)
REFERENCES `items` (
	`item_code`
);

ALTER TABLE `stock_usages` ADD CONSTRAINT `FK_employees_TO_stock_usages_1` FOREIGN KEY (
	`use_man_no`
)
REFERENCES `employees` (
	`man_no`
);

ALTER TABLE `stock_usages` ADD CONSTRAINT `FK_employees_TO_stock_usages_2` FOREIGN KEY (
	`cancel_man_no`
)
REFERENCES `employees` (
	`man_no`
);

ALTER TABLE `stock_usages` ADD CONSTRAINT `FK_Storage_TO_stock_usages_1` FOREIGN KEY (
	`storage_code`
)
REFERENCES `Storage` (
	`storage_code`
);

ALTER TABLE `stock_usages` ADD CONSTRAINT `FK_items_TO_stock_usages_1` FOREIGN KEY (
	`item_code`
)
REFERENCES `items` (
	`item_code`
);

ALTER TABLE `audit_logs` ADD CONSTRAINT `FK_employees_TO_audit_logs_1` FOREIGN KEY (
	`man_no`
)
REFERENCES `employees` (
	`man_no`
);
