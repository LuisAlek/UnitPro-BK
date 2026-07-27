import axios, { AxiosInstance } from "axios";
import { quickbooksConfig } from "../../../config/quickbooks";
import { env } from "../../../config/env";
import { IQuickBooksTokenRepository } from "../../../core/domain/ports/IQuickBooksTokenRepository";

export class QuickBooksClient {
  private http: AxiosInstance;
  private tokenRepo: IQuickBooksTokenRepository;

  constructor(tokenRepo: IQuickBooksTokenRepository) {
    this.tokenRepo = tokenRepo;
    this.http = axios.create({
      baseURL: quickbooksConfig.baseUrl,
      timeout: 30000,
    });
  }

  async getToken(userId: string) {
    const token = await this.tokenRepo.findByUserId(userId);
    if (!token) throw new Error("QuickBooks not connected");
    return token;
  }

  async refreshAccessToken(userId: string, refreshToken: string): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date }> {
    const basicAuth = Buffer.from(`${quickbooksConfig.clientId}:${quickbooksConfig.clientSecret}`).toString("base64");
    const { data } = await axios.post(
      quickbooksConfig.tokenEndpoint,
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
      {
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000);
    const existing = await this.tokenRepo.findByUserId(userId);
    if (existing) {
      await this.tokenRepo.save({
        ...existing,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt,
      });
    }
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
    };
  }

  private async ensureValidToken(userId: string): Promise<string> {
    const token = await this.getToken(userId);
    if (new Date() >= token.expiresAt) {
      const refreshed = await this.refreshAccessToken(userId, token.refreshToken);
      return refreshed.accessToken;
    }
    return token.accessToken;
  }

  async get<T>(userId: string, path: string): Promise<T> {
    const token = await this.getToken(userId);
    const accessToken = await this.ensureValidToken(userId);
    const { data } = await this.http.get(`/v3/company/${token.realmId}${path}?minorversion=${quickbooksConfig.minorVersion}`, {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    return data;
  }

  async post<T>(userId: string, path: string, body: unknown): Promise<T> {
    const token = await this.getToken(userId);
    const accessToken = await this.ensureValidToken(userId);
    const { data } = await this.http.post(`/v3/company/${token.realmId}${path}?minorversion=${quickbooksConfig.minorVersion}`, body, {
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json", Accept: "application/json" },
    });
    return data;
  }

  async query<T>(userId: string, query: string): Promise<T> {
    const token = await this.getToken(userId);
    const accessToken = await this.ensureValidToken(userId);
    const { data } = await this.http.get(`/v3/company/${token.realmId}/query`, {
      params: { query, minorversion: quickbooksConfig.minorVersion },
      headers: { Authorization: `Bearer ${accessToken}`, Accept: "application/json" },
    });
    return data;
  }

  async exchangeCodeForTokens(code: string, realmId: string): Promise<{ accessToken: string; refreshToken: string; expiresAt: Date }> {
    const basicAuth = Buffer.from(`${quickbooksConfig.clientId}:${quickbooksConfig.clientSecret}`).toString("base64");
    const { data } = await axios.post(
      quickbooksConfig.tokenEndpoint,
      new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: quickbooksConfig.redirectUri,
      }),
      {
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
      }
    );
    const expiresAt = new Date(Date.now() + (data.expires_in || 3600) * 1000);
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt,
    };
  }
}
