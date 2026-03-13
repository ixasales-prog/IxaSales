/**
 * User Location Map Page
 *
 * Full-page map view showing all tracked users for supervisors/admins.
 */

import type { Component } from 'solid-js';
import UserLocationMap from '../../components/gps-tracking/UserLocationMap';
import PageHeader from '../../components/page/PageHeader';
import PageSection from '../../components/page/PageSection';
import PageShell from '../../components/page/PageShell';

const UserLocationMapPage: Component = () => {
  return (
    <PageShell>
      <div class="space-y-6">
        <PageHeader
          title="User Locations"
          description="Real-time GPS tracking map for enabled sales reps and drivers."
          backHref="/admin/gps-tracking"
          backLabel="Back to GPS settings"
        />

        <PageSection class="overflow-hidden" contentClass="p-0">
          <div class="min-h-[520px] h-[520px] lg:h-[calc(100vh-16rem)]">
            <UserLocationMap />
          </div>
        </PageSection>
      </div>
    </PageShell>
  );
};

export default UserLocationMapPage;
