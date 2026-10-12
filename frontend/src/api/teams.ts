import client from './client';

export interface Team {
  team_code: string;
  team_name: string;
  description?: string;
  is_active: number;
}

export interface CreateTeamDto {
  team_code: string;
  team_name: string;
  description?: string;
}

export const teamsApi = {
  findAll:      () => client.get<Team[]>('/teams').then(r => r.data),
  findOne:      (code: string) => client.get<Team>(`/teams/${code}`).then(r => r.data),
  create:       (dto: CreateTeamDto) => client.post<Team>('/teams', dto).then(r => r.data),
  update:       (code: string, dto: Partial<CreateTeamDto>) => client.patch<Team>(`/teams/${code}`, dto).then(r => r.data),
  toggleActive: (code: string) => client.patch<Team>(`/teams/${code}/toggle-active`).then(r => r.data),
};
