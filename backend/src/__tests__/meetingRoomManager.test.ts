import assert from "node:assert/strict";
import {
  MeetingRoomManager,
  type SocketUserContext,
} from "../socket/meetingRoomManager.js";

const TENANT_A = "00000000-0000-0000-0000-000000000001";
const TENANT_B = "00000000-0000-0000-0000-000000000002";

const teacherCenterA: SocketUserContext = {
  id: "u-teacher-a",
  tenantId: TENANT_A,
  fullName: "Anita Teacher",
  email: "anita@eduspace.org",
  role: "teacher",
  centerIds: ["center-a"],
};

const staffCenterA: SocketUserContext = {
  id: "u-staff-a",
  tenantId: TENANT_A,
  fullName: "Rohan Staff",
  email: "rohan@eduspace.org",
  role: "staff",
  centerIds: ["center-a"],
};

const teacherCenterB: SocketUserContext = {
  id: "u-teacher-b",
  tenantId: TENANT_A,
  fullName: "Kiran CenterB",
  email: "kiran@eduspace.org",
  role: "teacher",
  centerIds: ["center-b"],
};

const superAdminA: SocketUserContext = {
  id: "u-super-a",
  tenantId: TENANT_A,
  fullName: "Vikram SuperAdmin",
  email: "vikram@eduspace.org",
  role: "super_admin",
  centerIds: [],
};

const studentUser: SocketUserContext = {
  id: "u-student-1",
  tenantId: TENANT_A,
  fullName: "Student User",
  email: "student@eduspace.org",
  role: "student",
  centerIds: ["center-a"],
};

const otherTenantStaff: SocketUserContext = {
  id: "u-staff-tenant-b",
  tenantId: TENANT_B,
  fullName: "Tenant B Staff",
  email: "staff@tenantb.org",
  role: "staff",
  centerIds: ["center-a"],
};

async function runTests() {
  console.log("🧪 Running MeetingRoomManager Verification Suite...\n");

  // 1. Role Guard: Students cannot create or list rooms
  {
    const mgr = new MeetingRoomManager(5000);
    assert.throws(
      () => mgr.createRoom(studentUser, { name: "Student Room" }, () => {}),
      /Only staff and administrators can create meeting rooms/,
    );
    const created = mgr.createRoom(teacherCenterA, { name: "Staff Sync" }, () => {});
    assert.equal(mgr.listRoomsForUser(studentUser).length, 0);
    assert.throws(
      () => mgr.joinRoom("sock-stu", studentUser, created.id, undefined, () => {}),
      /You do not have permission/,
    );
    console.log("✅ 1. Employee-only RBAC verified (students blocked from create/list/join)");
  }

  // 2. Tenant Isolation & Center Scoping
  {
    const mgr = new MeetingRoomManager(5000);
    const centerARoom = mgr.createRoom(
      teacherCenterA,
      {
        name: "Center A Operations",
        category: "operations",
        centerId: "center-a",
        centerName: "Center A",
      },
      () => {},
    );

    // Teacher in Center A & Super Admin see it; Teacher in Center B & Tenant B Staff do not
    assert.equal(mgr.listRoomsForUser(teacherCenterA).length, 1);
    assert.equal(mgr.listRoomsForUser(superAdminA).length, 1);
    assert.equal(mgr.listRoomsForUser(teacherCenterB).length, 0);
    assert.equal(mgr.listRoomsForUser(otherTenantStaff).length, 0);

    assert.throws(
      () => mgr.joinRoom("sock-b", teacherCenterB, centerARoom.id, undefined, () => {}),
      /You do not have permission/,
    );
    console.log("✅ 2. Multi-tenant isolation & Center-scoping verified");
  }

  // 3. Room Admin privileges, Lock/Unlock, Mute, Kick & Ephemeral Chat Erasure
  {
    const mgr = new MeetingRoomManager(5000);
    const room = mgr.createRoom(
      staffCenterA,
      { name: "Daily Standup", category: "standup" },
      () => {},
    );

    const joinHost = mgr.joinRoom("sock-host", staffCenterA, room.id, undefined, () => {});
    assert.equal(joinHost.participant.isRoomAdmin, true);
    assert.equal(joinHost.room.idleExpiresAt, null);

    const joinPeer = mgr.joinRoom("sock-peer", teacherCenterA, room.id, undefined, () => {});
    assert.equal(joinPeer.participant.isRoomAdmin, false);

    // Ephemeral Chat
    const msg = mgr.appendChatMessage("sock-peer", teacherCenterA, room.id, "Hello team!");
    assert.equal(msg.content, "Hello team!");

    // Room Lock by Host (staffCenterA is Room Admin)
    const locked = mgr.toggleLock(staffCenterA, room.id);
    assert.equal(locked.room.isLocked, true);

    // Remote Mute by Host
    const muted = mgr.adminMuteParticipant(staffCenterA, room.id, "sock-peer");
    assert.equal(muted.targetParticipant.mediaState.isMuted, true);

    // Kick by Host
    const kicked = mgr.adminKickParticipant(staffCenterA, room.id, "sock-peer", () => {});
    assert.equal(kicked.room.participants.length, 1);

    // Non-admin cannot end room
    assert.throws(
      () => mgr.endRoom(teacherCenterA, room.id),
      /Only the Room Admin/,
    );

    // Host ends room -> room and ephemeral chat are permanently destroyed
    const ended = mgr.endRoom(staffCenterA, room.id);
    assert.equal(ended.endedRoomId, room.id);
    assert.equal(mgr.hasRoom(TENANT_A, room.id), false);
    console.log("✅ 3. Room Admin moderation (lock, mute, kick) & ephemeral chat erasure verified");
  }

  // 4. Automatic Idle Expiration When Room Becomes Empty
  {
    let expiredRoomId: string | null = null;
    const mgr = new MeetingRoomManager(80); // 80ms idle timeout for test

    const room = mgr.createRoom(
      teacherCenterA,
      { name: "Auto-Close Test Room" },
      (rId) => {
        expiredRoomId = rId;
      },
    );

    // Join clears the idle timer
    const joined = mgr.joinRoom("sock-1", teacherCenterA, room.id, undefined, () => {});
    assert.equal(joined.room.idleExpiresAt, null);

    // Leaving sets the idle timer because 0 participants remain
    const left = mgr.leaveRoom("sock-1", TENANT_A, room.id, (rId) => {
      expiredRoomId = rId;
    });
    assert.ok(left.room?.idleExpiresAt, "Expected idleExpiresAt to be set when room is empty");

    // Wait 140ms for idle timeout to trigger
    await new Promise((resolve) => setTimeout(resolve, 140));
    assert.equal(expiredRoomId, room.id);
    assert.equal(mgr.hasRoom(TENANT_A, room.id), false);
    console.log("✅ 4. Empty room inactivity timer & auto-expiration verified");
  }

  console.log("\n🎉 All MeetingRoomManager tests passed!");
}

runTests().catch((err) => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
