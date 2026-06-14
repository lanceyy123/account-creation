export const SITES = {

  worldcup: {
    enabled: false,

    name: "WorldCup",
    siteUrl: "https://www.worldcupph.ph",
    merchant: "wlcphtlbf3",

    captchaRequired: false,
    captchaId: null,

    mobileLength: 10,
    stripLeadingZero: true,

    domain: "worldcup",
    affiliateCode: "www",

    isAppPromo: "Y",

    promoTypes: {
      wheel: "PRIZE_WHEEL",
      freeSpin: null
    },

    promoEndpoints: {
      list: "/wps/relay/PROMOFE_getClaimTicketList",
      wheel: "/wps/relay/PROMOFE_claimTicket",
      freeSpin: null
    }
  },

  luckycalico: {
    enabled: false,

    name: "LuckyCalico",
    siteUrl: "https://www.luckycalico.ph",
    merchant: "luckycaf3",

    captchaRequired: true,
    captchaId: "10578edd4000cf44530a193e12f275de",

    mobileLength: 10,
    stripLeadingZero: false,

    domain: "luckycalico",
    affiliateCode: "www",

    isAppPromo: "N",

    promoTypes: {
      wheel: "PRIZE_WHEEL",
      freeSpin: "FREE_SPIN"
    },

    promoEndpoints: {
      list: "/wps/relay/PROMOFE_getClaimTicketList",
      wheel: "/wps/relay/PROMOFE_claimTicket",
      freeSpin: "/wps/relay/PROMOFE_claimFreeSpinTicketV2"
    }
  },

  mvpph: {
    enabled: false,

    name: "MVPPH",
    siteUrl: "https://www.mvpph.vip",
    merchant: "mvpphtlbs2",

    captchaRequired: true,
    captchaId: "fa2202091f2d9086161947f672579b1d",

    mobileLength: 11,
    stripLeadingZero: false,

    domain: "mvpph",
    affiliateCode: "www",

    isAppPromo: "N",

    promoTypes: {
      wheel: "PRIZE_WHEEL",
      freeSpin: "FREE_SPIN"
    },

    promoEndpoints: {
      list: "/wps/relay/PROMOFE_getClaimTicketList",
      wheel: "/wps/relay/PROMOFE_claimTicket",
      freeSpin: "/wps/relay/PROMOFE_claimFreeSpinTicketV2"
    }
  },

  roostervolt: {
    enabled: false,

    name: "RoosterVolt",
    siteUrl: "https://www.roostervolt.win",
    merchant: "72phtlbs2",

    captchaRequired: true,
    captchaId: "59df97a1e0cb40b4abb4743cb2bf9827",

    mobileLength: 11,
    stripLeadingZero: false,

    domain: "roostervolt",
    affiliateCode: "www",

    isAppPromo: "N",

    promoTypes: {
      wheel: "PRIZE_WHEEL",
      freeSpin: "FREE_SPIN"
    },

    promoEndpoints: {
      list: "/wps/relay/PROMOFE_getClaimTicketList",
      wheel: "/wps/relay/PROMOFE_claimTicket",
      freeSpin: "/wps/relay/PROMOFE_claimFreeSpinTicketV2"
    }
  },

  applelucky: {
    enabled: true,

    name: "AppleLucky",
    siteUrl: "https://www.applelucky8.com",
    merchant: "eag99tlbs2",

    captchaRequired: false,
    captchaId: null,

    mobileLength: 10,
    stripLeadingZero: true,

    domain: "applelucky8",
    affiliateCode: "www",

    isAppPromo: "Y",

    promoTypes: {
      wheel: "PRIZE_WHEEL",
      freeSpin: "FREE_SPIN"
    },

    promoEndpoints: {
      list: "/wps/relay/PROMOFE_getClaimTicketList",
      wheel: "/wps/relay/PROMOFE_claimTicket",
      freeSpin: "/wps/relay/PROMOFE_claimFreeSpinTicketV2"
    }
  }

};