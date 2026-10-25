import {
  runRenewalConsentTerminationContract,
  terminationConsentInput,
} from '@/tests/shared/renewal-consent-termination-contract';
import { FakeRenewalConsentRecordRepository } from './fake-renewal-consent-record-repository';

runRenewalConsentTerminationContract(
  'FakeRenewalConsentRecordRepository',
  async () => ({
    async seed(input) {
      const repository = new FakeRenewalConsentRecordRepository();
      const record = await repository.save(
        terminationConsentInput(crypto.randomUUID(), input),
      );
      return { record, repository, competingRepository: repository };
    },
  }),
);
