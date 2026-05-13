export const ATTACHMENT_TAGS = {
  powerCore: ["damage"], powerCore2: ["damage"], powerCore3: ["damage"], powerCore4: ["damage"], powerCore5: ["damage"],
  rapidMechanism: ["fireRate"], rapidMechanism2: ["fireRate"], rapidMechanism3: ["fireRate"], rapidMechanism4: ["fireRate"], rapidMechanism5: ["fireRate"],
  rangeTube: ["range"], rangeTube2: ["range"], rangeTube3: ["range"], rangeTube4: ["range"], rangeTube5: ["range"],
  areaLens: ["area"], areaLens2: ["area"], areaLens3: ["area"], areaLens4: ["area"], areaLens5: ["area"],
  stableGrip: ["range", "crit"], vitalityCharm: ["defense"], guardBadge: ["defense"], scrapMagnet: ["support"], lightSneaker: ["support"], speedCore: ["fireRate"],
  pierceTip: ["pierce"], pierceTip2: ["pierce"], pierceTip3: ["pierce"], pierceTip4: ["pierce"], pierceTip5: ["pierce"],
  ricochetCore: ["ricochet", "bounce"], ricochetCore2: ["ricochet", "bounce"], splitCore: ["split", "ricochet"], shatterCore: ["split", "explosion"],
  explosiveCore: ["explosion", "area", "damage"], criticalCore: ["crit", "damage"], frostCore: ["freeze", "duration"], orbitCore: ["orbit", "area"], knockbackCore: ["knockback", "defense"],
  safetyField: ["defense"], safetyField2: ["defense"], safetyField3: ["defense"],
};

export function tagsForAttachment(attachment) {
  if (!attachment) return [];
  const explicit = attachment.tags || ATTACHMENT_TAGS[attachment.key] || [];
  const tags = new Set(explicit);
  if (attachment.category === "support") tags.add("defense");
  if (attachment.category === "stat") tags.add("damage");
  return Array.from(tags);
}
