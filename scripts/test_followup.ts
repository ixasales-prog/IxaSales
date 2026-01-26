/**
 * Manual test script to trigger follow-up reminders
 */

import { runFollowUpRemindersJob } from '../src/lib/scheduler/jobs/deepFollowUpReminders';

async function testFollowUpReminders() {
    console.log('🧪 Testing follow-up reminders job...');
    
    try {
        await runFollowUpRemindersJob();
        console.log('✅ Follow-up reminders job completed successfully');
    } catch (error) {
        console.error('❌ Follow-up reminders job failed:', error);
    }
}

// Run the test
testFollowUpReminders();