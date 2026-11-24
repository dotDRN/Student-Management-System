import { describe, it } from "node:test";
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
  email: "anita@edbase.org",
  role: "teacher",
  centerIds: ["center-a"],
};

const staffCenterA: SocketUserContext = {
  id: "u-staff-a",
  tenantId: TENANT_A,
  fullName: "Rohan Staff",
  email: "rohan@edbase.org",
  role: "staff",
  centerIds: ["center-a"],
};

const teacherCenterB: SocketUserContext = {
  id: "u-teacher-b",
  tenantId: TENANT_A,
  fullName: "Kiran CenterB",
  email: "kiran@edbase.org",
  role: "teacher",
  centerIds: ["center-b"],
};

const superAdminA: SocketUserContext = {
  id: "u-super-a",
  tenantId: TENANT_A,
  fullName: "Vikram SuperAdmin",
  email: "vikram@edbase.org",
  role: "super_admin",
  centerIds: [],
};

const studentUser: SocketUserContext = {
  id: "u-student-1",
  tenantId: TENANT_A,
  fullName: "Student User",
  email: "student@edbase.org",
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

describe("MeetingRoomManager", () => {
  it("blocks non-employees (students) from creating, listing, or joining rooms", () => {
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
  });

  it("enforces multi-tenant isolation and center scoping", () => {
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

    assert.equal(mgr.listRoomsForUser(teacherCenterA).length, 1);
    assert.equal(mgr.listRoomsForUser(superAdminA).length, 1);
    assert.equal(mgr.listRoomsForUser(teacherCenterB).length, 0);
    assert.equal(mgr.listRoomsForUser(otherTenantStaff).length, 0);

    assert.throws(
      () => mgr.joinRoom("sock-b", teacherCenterB, centerARoom.id, undefined, () => {}),
      /You do not have permission/,
    );
  });

  it("supports room admin moderation (lock, mute, kick) and destroys room chat on end", () => {
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

    const msg = mgr.appendChatMessage("sock-peer", teacherCenterA, room.id, "Hello team!");
    assert.equal(msg.content, "Hello team!");

    const locked = mgr.toggleLock(staffCenterA, room.id);
    assert.equal(locked.room.isLocked, true);

    const muted = mgr.adminMuteParticipant(staffCenterA, room.id, "sock-peer");
    assert.equal(muted.targetParticipant.mediaState.isMuted, true);

    const kicked = mgr.adminKickParticipant(staffCenterA, room.id, "sock-peer", () => {});
    assert.equal(kicked.room.participants.length, 1);

    assert.throws(
      () => mgr.endRoom(teacherCenterA, room.id),
      /Only the Room Admin/,
    );

    const ended = mgr.endRoom(staffCenterA, room.id);
    assert.equal(ended.endedRoomId, room.id);
    assert.equal(mgr.hasRoom(TENANT_A, room.id), false);
  });

  it("auto-expires empty rooms after the inactivity timeout", async () => {
    let expiredRoomId: string | null = null;
    const mgr = new MeetingRoomManager(80);

    const room = mgr.createRoom(
      teacherCenterA,
      { name: "Auto-Close Test Room" },
      (rId) => {
        expiredRoomId = rId;
      },
    );

    const joined = mgr.joinRoom("sock-1", teacherCenterA, room.id, undefined, () => {});
    assert.equal(joined.room.idleExpiresAt, null);

    const left = mgr.leaveRoom("sock-1", TENANT_A, room.id, (rId) => {
      expiredRoomId = rId;
    });
    assert.ok(left.room?.idleExpiresAt, "Expected idleExpiresAt to be set when room is empty");

    await new Promise((resolve) => setTimeout(resolve, 140));
    assert.equal(expiredRoomId, room.id);
    assert.equal(mgr.hasRoom(TENANT_A, room.id), false);
  });
});
