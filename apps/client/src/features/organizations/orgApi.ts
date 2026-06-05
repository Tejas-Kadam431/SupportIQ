import { api } from "../../app/api";

export type Role = "OWNER" | "ADMIN" | "AGENT" | "CUSTOMER";

export type Organization = {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
};

export type OrganizationListItem = {
  membershipId: string;
  role: Role;
  organization: Organization;
};

export type UserSummary = {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  createdAt?: string;
};

export type OrganizationMember = {
  id: string;
  organizationId: string;
  userId: string;
  role: Role;
  createdAt: string;
  updatedAt: string;
  user: UserSummary;
};

export type ListOrganizationsResponse = {
  data: {
    organizations: OrganizationListItem[];
  };
};

export type CreateOrganizationResponse = {
  message: string;
  data: {
    organization: Organization;
  };
};

export type ListMembersResponse = {
  data: {
    members: OrganizationMember[];
  };
};

export type AddMemberResponse = {
  message: string;
  data: {
    member: OrganizationMember;
  };
};

export const orgApi = api.injectEndpoints({
  endpoints: (builder) => ({
    listOrganizations: builder.query<ListOrganizationsResponse, void>({
      query: () => "/organizations",
      providesTags: ["Organizations"]
    }),

    createOrganization: builder.mutation<CreateOrganizationResponse, { name: string }>({
      query: (body) => ({
        url: "/organizations",
        method: "POST",
        body
      }),
      invalidatesTags: ["Organizations"]
    }),

    listMembers: builder.query<ListMembersResponse, string>({
      query: (orgId) => `/organizations/${orgId}/members`,
      providesTags: ["Organizations"]
    }),

    addMember: builder.mutation<
      AddMemberResponse,
      { orgId: string; email: string; role: Exclude<Role, "OWNER"> }
    >({
      query: ({ orgId, ...body }) => ({
        url: `/organizations/${orgId}/members`,
        method: "POST",
        body
      }),
      invalidatesTags: ["Organizations"]
    }),

    updateMemberRole: builder.mutation<
      AddMemberResponse,
      { orgId: string; memberId: string; role: Exclude<Role, "OWNER"> }
    >({
      query: ({ orgId, memberId, role }) => ({
        url: `/organizations/${orgId}/members/${memberId}`,
        method: "PATCH",
        body: { role }
      }),
      invalidatesTags: ["Organizations"]
    }),

    removeMember: builder.mutation<{ message: string }, { orgId: string; memberId: string }>({
      query: ({ orgId, memberId }) => ({
        url: `/organizations/${orgId}/members/${memberId}`,
        method: "DELETE"
      }),
      invalidatesTags: ["Organizations"]
    })
  })
});

export const {
  useListOrganizationsQuery,
  useCreateOrganizationMutation,
  useListMembersQuery,
  useAddMemberMutation,
  useUpdateMemberRoleMutation,
  useRemoveMemberMutation
} = orgApi;