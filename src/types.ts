export type Issue = {
    key: string;
    summary: string;
    status: string;
    reporter?: string;
    assignee?: string;
};

export type Transition = {
    to: string;
    at: string;
};