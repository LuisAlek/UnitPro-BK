import crypto from "crypto";
import { env } from "./env";

const BASE_URLS = {
  sandbox: "https://sandbox-quickbooks.api.intuit.com",
  production: "https://quickbooks.api.intuit.com",
};

const AUTH_ENDPOINT = "https://appcenter.intuit.com/connect/oauth2";
const TOKEN_ENDPOINT = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

export const quickbooksConfig = {
  clientId: env.QB_CLIENT_ID,
  clientSecret: env.QB_CLIENT_SECRET,
  redirectUri: env.QB_REDIRECT_URI,
  environment: env.QB_ENVIRONMENT,
  scopes: "com.intuit.quickbooks.accounting",
  minorVersion: "75",

  get baseUrl(): string {
    return BASE_URLS[this.environment];
  },

  get authUrl(): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: "code",
      scope: this.scopes,
      state: crypto.randomUUID(),
    });
    return `${AUTH_ENDPOINT}?${params.toString()}`;
  },

  tokenEndpoint: TOKEN_ENDPOINT,
};
