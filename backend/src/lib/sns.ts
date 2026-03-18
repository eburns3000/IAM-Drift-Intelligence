/**
 * IAM Drift Intelligence — SNS Client + Helpers
 */

import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';

export const snsClient = new SNSClient({
  region: process.env.AWS_REGION || 'us-east-1',
});

export async function publishAlert(topicArn: string, subject: string, message: string): Promise<void> {
  await snsClient.send(
    new PublishCommand({
      TopicArn: topicArn,
      Subject: subject,
      Message: message,
    })
  );
}

export function getAlertTopicArn(): string | null {
  return process.env.SNS_ALERT_TOPIC_ARN ?? null;
}
