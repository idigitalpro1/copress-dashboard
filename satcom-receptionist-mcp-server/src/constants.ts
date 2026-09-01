export const CHARACTER_LIMIT = 25000;

export const SIP_HOST = "1722.3cx.cloud";

export interface Department {
  key: string;
  name: string;
  extension: string;
  sipUri: string;
  useWhen: string;
}

// Source of truth: README.md "3CX SIP Extensions" and network.html's
// 3CX Phone System card. Update both places together if extensions change.
export const DEPARTMENTS: Department[] = [
  {
    key: "patrick",
    name: "Patrick Sweeney",
    extension: "17410",
    sipUri: `sip:17410@${SIP_HOST}`,
    useWhen:
      "Ownership, partnerships, press, or anything the caller says is urgent / wants \"the person in charge.\""
  },
  {
    key: "editorial",
    name: "Editorial",
    extension: "17413",
    sipUri: `sip:17413@${SIP_HOST}`,
    useWhen: "Story tips, corrections, letters to the editor, press releases."
  },
  {
    key: "subscriptions",
    name: "Subscriptions",
    extension: "17414",
    sipUri: `sip:17414@${SIP_HOST}`,
    useWhen: "Subscribe, renew, delivery issues, billing questions about a subscription."
  },
  {
    key: "advertising",
    name: "Advertising",
    extension: "17415",
    sipUri: `sip:17415@${SIP_HOST}`,
    useWhen: "Ad rates, campaign kits, sponsorships, new advertiser inquiries."
  },
  {
    key: "production",
    name: "Production",
    extension: "17416",
    sipUri: `sip:17416@${SIP_HOST}`,
    useWhen: "Print schedule, proofs, file specs, press deadlines."
  }
];
