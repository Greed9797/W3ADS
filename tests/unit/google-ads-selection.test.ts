import { describe, expect, it } from "vitest";

import {
  GOOGLE_ADS_CUSTOMER_CLIENT_QUERY,
  normalizeGoogleAdsCustomerClientRow,
  selectGoogleAdsAdvertiserAccounts,
} from "@/lib/connectors/google-ads/client";

describe("Google Ads account selection", () => {
  it("uses customer_client to expand MCC hierarchies", () => {
    expect(GOOGLE_ADS_CUSTOMER_CLIENT_QUERY).toContain("customer_client.client_customer");
    expect(GOOGLE_ADS_CUSTOMER_CLIENT_QUERY).toContain("customer_client.manager");
  });

  it("normalizes customer_client rows with manager ancestry", () => {
    expect(
      normalizeGoogleAdsCustomerClientRow(
        {
          customerClient: {
            id: "2223334444",
            clientCustomer: "customers/2223334444",
            descriptiveName: "Cliente Final",
            currencyCode: "BRL",
            timeZone: "America/Sao_Paulo",
            manager: false,
            level: 1,
          },
        },
        { rootCustomerId: "1112223333", loginCustomerId: "1112223333" },
      ),
    ).toEqual({
      id: "2223334444",
      name: "Cliente Final",
      resourceName: "customers/2223334444",
      currencyCode: "BRL",
      timeZone: "America/Sao_Paulo",
      isManager: false,
      level: 1,
      loginCustomerId: "1112223333",
      rootCustomerId: "1112223333",
    });
  });

  it("filters selectable accounts to advertiser clients, not MCC managers", () => {
    expect(
      selectGoogleAdsAdvertiserAccounts([
        {
          id: "111",
          name: "MCC",
          resourceName: "customers/111",
          isManager: true,
          level: 0,
          loginCustomerId: "111",
          rootCustomerId: "111",
        },
        {
          id: "222",
          name: "Cliente",
          resourceName: "customers/222",
          isManager: false,
          level: 1,
          loginCustomerId: "111",
          rootCustomerId: "111",
        },
      ]),
    ).toEqual([
      {
        id: "222",
        name: "Cliente",
        resourceName: "customers/222",
        isManager: false,
        level: 1,
        loginCustomerId: "111",
        rootCustomerId: "111",
      },
    ]);
  });
});
