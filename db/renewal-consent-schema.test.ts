import { getTableColumns } from 'drizzle-orm';
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import {
  RENEWAL_NOTICE_ACKNOWLEDGMENT_UQ,
  RENEWAL_NOTICE_SCHEDULED_UQ,
  renewalConsentKindEnum,
  renewalConsentRecords,
  renewalConsentSourceEnum,
  renewalNoticeDeliveries,
  renewalNoticeDeliveryStatusEnum,
} from './schema';

describe('renewal consent schema', () => {
  it('retains records after user deletion through a nullable set-null reference', () => {
    const columns = getTableColumns(renewalConsentRecords);
    const userForeignKey = getTableConfig(
      renewalConsentRecords,
    ).foreignKeys.find(
      (foreignKey) => foreignKey.reference().columns[0]?.name === 'user_id',
    );

    expect(columns.userId.notNull).toBe(false);
    expect(userForeignKey?.onDelete).toBe('set null');
  });

  it('defines the two consent kinds without shipping price-change behavior', () => {
    expect(renewalConsentKindEnum.enumValues).toEqual([
      'initial_offer',
      'price_increase',
    ]);
    expect(renewalConsentSourceEnum.enumValues).toEqual([
      'stripe_checkout',
      'stripe_setup',
      'application',
    ]);
  });

  it('pins the six-state delivery machine', () => {
    expect(renewalNoticeDeliveryStatusEnum.enumValues).toEqual([
      'queued',
      'processing',
      'delivered',
      'transient_failure',
      'terminal_failure',
      'outcome_unknown',
    ]);

    const columns = getTableColumns(renewalNoticeDeliveries);
    expect(columns.requeueAudit.notNull).toBe(true);
    expect(columns.requeueAudit.hasDefault).toBe(true);
  });

  it('uses separate partial unique indexes for acknowledgments and scheduled notices', () => {
    const tableConfig = getTableConfig(renewalNoticeDeliveries);
    const indexes = tableConfig.indexes;
    const acknowledgment = indexes.find(
      (index) => index.config.name === RENEWAL_NOTICE_ACKNOWLEDGMENT_UQ,
    );
    const scheduled = indexes.find(
      (index) => index.config.name === RENEWAL_NOTICE_SCHEDULED_UQ,
    );

    expect(acknowledgment?.config.unique).toBe(true);
    expect(acknowledgment?.config.where).toBeDefined();
    expect(scheduled?.config.unique).toBe(true);
    expect(scheduled?.config.where).toBeDefined();
    expect(acknowledgment?.config.columns).toHaveLength(3);
    expect(scheduled?.config.columns).toHaveLength(5);
    const dialect = new PgDialect();
    const acknowledgmentPredicate = acknowledgment?.config.where
      ? dialect.sqlToQuery(acknowledgment.config.where).sql
      : '';
    const scheduledPredicate = scheduled?.config.where
      ? dialect.sqlToQuery(scheduled.config.where).sql
      : '';
    expect(acknowledgmentPredicate).toContain(
      `"renewal_notice_deliveries"."notice_kind" = 'acknowledgment'`,
    );
    expect(scheduledPredicate).toContain(
      `"renewal_notice_deliveries"."notice_kind" IN ('annual_reminder', 'renewal_notice', 'material_change', 'fee_change')`,
    );

    const consentForeignKey = tableConfig.foreignKeys.find(
      (foreignKey) =>
        foreignKey.reference().columns[0]?.name === 'consent_record_id',
    );
    expect(consentForeignKey?.onDelete).toBe('cascade');

    const keyShapeCheck = tableConfig.checks.find(
      (constraint) =>
        constraint.name === 'renewal_notice_deliveries_key_shape_chk',
    );
    const checkSql = keyShapeCheck
      ? dialect
          .sqlToQuery(keyShapeCheck.value)
          .sql.replaceAll('"renewal_notice_deliveries".', '')
      : '';
    expect(checkSql).toContain(
      '"stripe_subscription_id" IS NULL AND "applicable_at" IS NULL',
    );
    expect(checkSql).toContain(
      '"consent_record_id" IS NULL AND "stripe_subscription_id" IS NOT NULL',
    );
  });
});
