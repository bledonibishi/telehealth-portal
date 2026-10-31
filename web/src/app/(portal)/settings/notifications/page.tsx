import { Card, CardHeader } from '@/components/portal/Card';
import { NotificationPreferences } from '@/components/portal/NotificationPreferences';
import { SettingsSubpage } from '@/components/portal/SettingsMenu';

export default function NotificationsSettingsPage() {
  return (
    <SettingsSubpage title="Notifications" subtitle="Choose what we send to your phone and by email.">
      <Card>
        <NotificationPreferences />
      </Card>
    </SettingsSubpage>
  );
}
