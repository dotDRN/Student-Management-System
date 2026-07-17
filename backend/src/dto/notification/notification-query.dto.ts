export interface NotificationQueryDto {
    page?: number;
    limit?: number;
    unreadOnly?: boolean;
    type?: string;
}