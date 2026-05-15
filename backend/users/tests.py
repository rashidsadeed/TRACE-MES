import hashlib
from datetime import timedelta

from django.test import TestCase, RequestFactory
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIClient

from users.models import CustomUser, UserSession
from users.utils import get_client_ip


class AuthLoginTests(TestCase):
    """Tests for POST /api/auth/login/"""

    def setUp(self):
        self.client = APIClient()
        self.user = CustomUser.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='StrongPass123!',
        )
        self.login_url = '/api/auth/login/'

    def test_login_returns_tokens(self):
        response = self.client.post(self.login_url, {
            'username': 'testuser',
            'password': 'StrongPass123!',
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)

    def test_login_creates_user_session(self):
        self.assertEqual(UserSession.objects.count(), 0)
        response = self.client.post(self.login_url, {
            'username': 'testuser',
            'password': 'StrongPass123!',
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(UserSession.objects.count(), 1)

        session = UserSession.objects.first()
        self.assertEqual(session.user, self.user)
        self.assertIsNone(session.ended_at)

        # Token stored should be the SHA-256 hash of the access token
        access_token = response.data['access']
        expected_hash = hashlib.sha256(access_token.encode()).hexdigest()
        self.assertEqual(session.token, expected_hash)

    def test_login_stores_client_ip(self):
        response = self.client.post(self.login_url, {
            'username': 'testuser',
            'password': 'StrongPass123!',
        })
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        session = UserSession.objects.first()
        self.assertIsNotNone(session.ip_address)

    def test_login_invalid_credentials_returns_401(self):
        response = self.client.post(self.login_url, {
            'username': 'testuser',
            'password': 'WrongPassword',
        })
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(UserSession.objects.count(), 0)

    def test_login_missing_fields_returns_400(self):
        response = self.client.post(self.login_url, {})
        self.assertIn(response.status_code, [
            status.HTTP_400_BAD_REQUEST,
            status.HTTP_401_UNAUTHORIZED,
        ])
        self.assertEqual(UserSession.objects.count(), 0)

    def test_login_inactive_user_cannot_login(self):
        self.user.is_active = False
        self.user.save()
        response = self.client.post(self.login_url, {
            'username': 'testuser',
            'password': 'StrongPass123!',
        })
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        self.assertEqual(UserSession.objects.count(), 0)


class AuthLogoutTests(TestCase):
    """Tests for POST /api/auth/logout/"""

    def setUp(self):
        self.client = APIClient()
        self.user = CustomUser.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='StrongPass123!',
        )
        self.logout_url = '/api/auth/logout/'

        # Login to get a token and session
        response = self.client.post('/api/auth/login/', {
            'username': 'testuser',
            'password': 'StrongPass123!',
        })
        self.access_token = response.data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.access_token}')

    def test_logout_sets_ended_at(self):
        response = self.client.post(self.logout_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        session = UserSession.objects.first()
        self.assertIsNotNone(session.ended_at)

    def test_logout_unauthenticated_returns_401(self):
        unauthenticated_client = APIClient()
        response = unauthenticated_client.post(self.logout_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_logout_twice_returns_404(self):
        # First logout succeeds
        self.client.post(self.logout_url)
        # Second logout should find no active session
        response = self.client.post(self.logout_url)
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_logout_only_ends_matching_session(self):
        # Create a second login session
        response2 = self.client.post('/api/auth/login/', {
            'username': 'testuser',
            'password': 'StrongPass123!',
        })
        # We now have 2 sessions
        self.assertEqual(UserSession.objects.filter(ended_at__isnull=True).count(), 2)

        # Logout with original token only ends one session
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.access_token}')
        self.client.post(self.logout_url)

        self.assertEqual(UserSession.objects.filter(ended_at__isnull=True).count(), 1)
        self.assertEqual(UserSession.objects.filter(ended_at__isnull=False).count(), 1)

    def test_logout_cannot_end_another_users_session(self):
        """IDOR protection: user B cannot logout user A's session."""
        # Create a second user and log them in
        user_b = CustomUser.objects.create_user(
            username='userb',
            email='userb@example.com',
            password='StrongPass123!',
        )
        client_b = APIClient()
        response_b = client_b.post('/api/auth/login/', {
            'username': 'userb',
            'password': 'StrongPass123!',
        })
        token_b = response_b.data['access']

        # User A's session should still be active
        user_a_session = UserSession.objects.filter(user=self.user, ended_at__isnull=True).first()
        self.assertIsNotNone(user_a_session)

        # User B tries to logout using user A's token hash by crafting request
        # with their own auth but user A's session should remain untouched
        client_b.credentials(HTTP_AUTHORIZATION=f'Bearer {token_b}')
        client_b.post('/api/auth/logout/')

        # User A's session should still be active (not ended by user B)
        user_a_session.refresh_from_db()
        self.assertIsNone(user_a_session.ended_at)


class AuthHeartbeatTests(TestCase):
    """Tests for POST /api/auth/heartbeat/"""

    def setUp(self):
        self.client = APIClient()
        self.user = CustomUser.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='StrongPass123!',
        )
        self.heartbeat_url = '/api/auth/heartbeat/'

        response = self.client.post('/api/auth/login/', {
            'username': 'testuser',
            'password': 'StrongPass123!',
        })
        self.access_token = response.data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.access_token}')

    def test_heartbeat_active_session_returns_200(self):
        response = self.client.post(self.heartbeat_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('last_activity', response.data)

    def test_heartbeat_updates_last_activity(self):
        session_before = UserSession.objects.first()
        old_activity = session_before.last_activity

        response = self.client.post(self.heartbeat_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        session_after = UserSession.objects.first()
        self.assertGreaterEqual(session_after.last_activity, old_activity)

    def test_heartbeat_expired_session_returns_401(self):
        # Manually set last_activity to 16 minutes ago to simulate expiry
        session = UserSession.objects.first()
        expired_time = timezone.now() - timedelta(minutes=16)
        UserSession.objects.filter(pk=session.pk).update(last_activity=expired_time)

        response = self.client.post(self.heartbeat_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

        # Session should now be closed
        session.refresh_from_db()
        self.assertIsNotNone(session.ended_at)

    def test_heartbeat_just_under_timeout_returns_200(self):
        # Session inactive for less than 15 minutes should remain active
        session = UserSession.objects.first()
        boundary_time = timezone.now() - timedelta(minutes=14, seconds=50)
        UserSession.objects.filter(pk=session.pk).update(last_activity=boundary_time)

        response = self.client.post(self.heartbeat_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_heartbeat_unauthenticated_returns_401(self):
        unauthenticated_client = APIClient()
        response = unauthenticated_client.post(self.heartbeat_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_heartbeat_after_logout_returns_401(self):
        self.client.post('/api/auth/logout/')
        response = self.client.post(self.heartbeat_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_heartbeat_cannot_update_another_users_session(self):
        """IDOR protection: user B's heartbeat should not affect user A's session."""
        # Create user B and log them in
        user_b = CustomUser.objects.create_user(
            username='userb',
            email='userb@example.com',
            password='StrongPass123!',
        )
        client_b = APIClient()
        response_b = client_b.post('/api/auth/login/', {
            'username': 'userb',
            'password': 'StrongPass123!',
        })
        token_b = response_b.data['access']
        client_b.credentials(HTTP_AUTHORIZATION=f'Bearer {token_b}')

        # Set user A's session to be expired
        user_a_session = UserSession.objects.filter(user=self.user, ended_at__isnull=True).first()
        expired_time = timezone.now() - timedelta(minutes=16)
        UserSession.objects.filter(pk=user_a_session.pk).update(last_activity=expired_time)

        # User B heartbeats their own session — should succeed
        response = client_b.post(self.heartbeat_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        # User A's session should still be expired (last_activity unchanged)
        user_a_session.refresh_from_db()
        self.assertIsNone(user_a_session.ended_at)  # not yet closed, just expired
        # Verify last_activity was NOT updated by user B's heartbeat
        self.assertAlmostEqual(
            user_a_session.last_activity.timestamp(),
            expired_time.timestamp(),
            delta=1,
        )


class GetClientIpTests(TestCase):
    """Tests for users.utils.get_client_ip"""

    def setUp(self):
        self.factory = RequestFactory()

    def test_ip_from_remote_addr(self):
        request = self.factory.get('/', REMOTE_ADDR='192.168.1.1')
        self.assertEqual(get_client_ip(request), '192.168.1.1')

    def test_ip_from_x_forwarded_for(self):
        request = self.factory.get(
            '/',
            REMOTE_ADDR='127.0.0.1',
            HTTP_X_FORWARDED_FOR='10.0.0.1, 10.0.0.2',
        )
        self.assertEqual(get_client_ip(request), '10.0.0.1')

    def test_ip_from_x_forwarded_for_single(self):
        request = self.factory.get(
            '/',
            REMOTE_ADDR='127.0.0.1',
            HTTP_X_FORWARDED_FOR='10.0.0.5',
        )
        self.assertEqual(get_client_ip(request), '10.0.0.5')


class UserManagementTests(TestCase):
    """Tests for UserViewSet — TASK-002."""

    def setUp(self):
        self.client = APIClient()

        # Primary user: admin (is_staff=True) — required for list/create/update/delete
        self.user = CustomUser.objects.create_user(
            username='primary_user',
            email='primary@example.com',
            password='StrongPass123!',
            is_staff=True,
        )

        # Authenticate the client with a real JWT
        response = self.client.post('/api/auth/login/', {
            'username': 'primary_user',
            'password': 'StrongPass123!',
        })
        self.access_token = response.data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.access_token}')

        # Second user for update/delete tests (non-admin)
        self.other_user = CustomUser.objects.create_user(
            username='other_user',
            email='other@example.com',
            password='StrongPass123!',
        )

        self.users_url = '/api/users/'
        self.me_url = '/api/users/me/'

    def _detail_url(self, user_id):
        return f'/api/users/{user_id}/'

    # ------------------------------------------------------------------
    # LIST  GET /api/users/
    # ------------------------------------------------------------------

    def test_list_authenticated_returns_200(self):
        response = self.client.get(self.users_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_list_returns_active_users(self):
        response = self.client.get(self.users_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        # Both self.user and self.other_user are active; at least 2 results
        self.assertGreaterEqual(len(response.data), 2)

    def test_list_unauthenticated_returns_401(self):
        unauthenticated = APIClient()
        response = unauthenticated.get(self.users_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_list_excludes_soft_deleted_users(self):
        # Soft-delete other_user
        self.other_user.delete()

        response = self.client.get(self.users_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        returned_ids = [str(u['id']) for u in response.data]
        self.assertNotIn(str(self.other_user.id), returned_ids)

    # ------------------------------------------------------------------
    # CREATE  POST /api/users/
    # ------------------------------------------------------------------

    def test_create_valid_user_returns_201(self):
        payload = {
            'username': 'newuser',
            'email': 'newuser@example.com',
            'password': 'NewPass123!',
        }
        response = self.client.post(self.users_url, payload)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

    def test_create_response_contains_id_username_email(self):
        payload = {
            'username': 'newuser2',
            'email': 'newuser2@example.com',
            'password': 'NewPass123!',
        }
        response = self.client.post(self.users_url, payload)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('id', response.data)
        self.assertIn('username', response.data)
        self.assertIn('email', response.data)

    def test_create_response_does_not_expose_password(self):
        payload = {
            'username': 'newuser3',
            'email': 'newuser3@example.com',
            'password': 'NewPass123!',
        }
        response = self.client.post(self.users_url, payload)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertNotIn('password', response.data)

    def test_create_duplicate_username_returns_400(self):
        payload = {
            'username': 'primary_user',  # already exists
            'email': 'unique_email@example.com',
            'password': 'NewPass123!',
        }
        response = self.client.post(self.users_url, payload)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_duplicate_email_returns_400(self):
        payload = {
            'username': 'unique_username',
            'email': 'primary@example.com',  # already exists
            'password': 'NewPass123!',
        }
        response = self.client.post(self.users_url, payload)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_short_password_returns_400(self):
        payload = {
            'username': 'shortpassuser',
            'email': 'shortpass@example.com',
            'password': 'abc',  # less than 8 chars
        }
        response = self.client.post(self.users_url, payload)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_missing_required_fields_returns_400(self):
        # Missing email and password
        response = self.client.post(self.users_url, {'username': 'onlyusername'})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_password_is_stored_hashed(self):
        plain_password = 'NewPass123!'
        payload = {
            'username': 'hashcheckuser',
            'email': 'hashcheck@example.com',
            'password': plain_password,
        }
        response = self.client.post(self.users_url, payload)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        created_user = CustomUser.objects.get(username='hashcheckuser')
        self.assertNotEqual(created_user.password, plain_password)
        # Django hashed passwords start with an algorithm identifier
        self.assertTrue(created_user.password.startswith(('pbkdf2_', 'bcrypt', 'argon2')))

    # ------------------------------------------------------------------
    # RETRIEVE  GET /api/users/{id}/
    # ------------------------------------------------------------------

    def test_retrieve_existing_user_returns_200(self):
        response = self.client.get(self._detail_url(self.other_user.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(str(response.data['id']), str(self.other_user.id))

    def test_retrieve_nonexistent_uuid_returns_404(self):
        import uuid
        fake_id = uuid.uuid4()
        response = self.client.get(self._detail_url(fake_id))
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)

    def test_retrieve_soft_deleted_user_returns_404(self):
        self.other_user.delete()
        response = self.client.get(self._detail_url(self.other_user.id))
        self.assertIn(response.status_code, [
            status.HTTP_404_NOT_FOUND,
            status.HTTP_403_FORBIDDEN,
        ])

    # ------------------------------------------------------------------
    # ME  GET /api/users/me/
    # ------------------------------------------------------------------

    def test_me_returns_200_with_own_profile(self):
        response = self.client.get(self.me_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['username'], self.user.username)
        self.assertEqual(response.data['email'], self.user.email)

    def test_me_unauthenticated_returns_401(self):
        unauthenticated = APIClient()
        response = unauthenticated.get(self.me_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_me_response_does_not_contain_password(self):
        response = self.client.get(self.me_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertNotIn('password', response.data)

    # ------------------------------------------------------------------
    # UPDATE  PATCH /api/users/{id}/
    # ------------------------------------------------------------------

    def test_partial_update_first_name_returns_200(self):
        response = self.client.patch(
            self._detail_url(self.other_user.id),
            {'first_name': 'Updated'},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.other_user.refresh_from_db()
        self.assertEqual(self.other_user.first_name, 'Updated')

    def test_partial_update_email_to_new_unique_address(self):
        response = self.client.patch(
            self._detail_url(self.other_user.id),
            {'email': 'totally_new@example.com'},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.other_user.refresh_from_db()
        self.assertEqual(self.other_user.email, 'totally_new@example.com')

    def test_partial_update_email_to_existing_address_returns_400(self):
        # Try to change other_user's email to primary_user's email
        response = self.client.patch(
            self._detail_url(self.other_user.id),
            {'email': 'primary@example.com'},
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_partial_update_password_field_not_accepted(self):
        """PATCH should not expose or update the password field."""
        old_password_hash = CustomUser.objects.get(pk=self.other_user.pk).password
        response = self.client.patch(
            self._detail_url(self.other_user.id),
            {'password': 'EvilNewPass1!'},
        )
        # The endpoint should either ignore or reject the password field.
        # In all cases the stored hash must remain unchanged.
        updated_user = CustomUser.objects.get(pk=self.other_user.pk)
        self.assertEqual(updated_user.password, old_password_hash)

    # ------------------------------------------------------------------
    # DELETE  DELETE /api/users/{id}/
    # ------------------------------------------------------------------

    def test_delete_other_user_returns_204(self):
        response = self.client.delete(self._detail_url(self.other_user.id))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

    def test_deleted_user_absent_from_list(self):
        self.client.delete(self._detail_url(self.other_user.id))

        list_response = self.client.get(self.users_url)
        returned_ids = [str(u['id']) for u in list_response.data]
        self.assertNotIn(str(self.other_user.id), returned_ids)

    def test_delete_own_account_returns_403(self):
        response = self.client.delete(self._detail_url(self.user.id))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_delete_is_soft_delete(self):
        """Deleted user still exists in DB but is_active=False."""
        self.client.delete(self._detail_url(self.other_user.id))

        # Use the base manager (objects) to bypass the active-only queryset
        db_user = CustomUser.objects.get(pk=self.other_user.pk)
        self.assertFalse(db_user.is_active)

    def test_delete_unauthenticated_returns_401(self):
        unauthenticated = APIClient()
        response = unauthenticated.delete(self._detail_url(self.other_user.id))
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # ------------------------------------------------------------------
    # PERMISSION ENFORCEMENT (non-admin must be denied)
    # ------------------------------------------------------------------

    def _non_admin_client(self):
        """Return an authenticated APIClient for a non-admin user."""
        non_admin = CustomUser.objects.create_user(
            username='non_admin',
            email='non_admin@example.com',
            password='StrongPass123!',
            is_staff=False,
        )
        client = APIClient()
        response = client.post('/api/auth/login/', {
            'username': 'non_admin',
            'password': 'StrongPass123!',
        })
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {response.data["access"]}')
        return client

    def test_non_admin_list_returns_403(self):
        response = self._non_admin_client().get(self.users_url)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_non_admin_create_returns_403(self):
        payload = {'username': 'x', 'email': 'x@x.com', 'password': 'StrongPass123!'}
        response = self._non_admin_client().post(self.users_url, payload)
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_non_admin_patch_returns_403(self):
        response = self._non_admin_client().patch(
            self._detail_url(self.other_user.id),
            {'first_name': 'Hacked'},
        )
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_non_admin_delete_returns_403(self):
        response = self._non_admin_client().delete(self._detail_url(self.other_user.id))
        self.assertEqual(response.status_code, status.HTTP_403_FORBIDDEN)

    def test_non_admin_retrieve_returns_200(self):
        """Non-admin users may still retrieve a user profile (read-only)."""
        response = self._non_admin_client().get(self._detail_url(self.other_user.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_non_admin_me_returns_200(self):
        """Non-admin users may access their own profile via /me/."""
        response = self._non_admin_client().get(self.me_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)


class AuditLogIntegrationTests(TestCase):
    """Tests for TASK-004 — AuditLog integration in UserViewSet."""

    def setUp(self):
        self.client = APIClient()

        # Admin user required for mutating operations on UserViewSet
        self.admin = CustomUser.objects.create_user(
            username='audit_admin',
            email='audit_admin@example.com',
            password='StrongPass123!',
            is_staff=True,
        )

        # Authenticate via real JWT
        response = self.client.post('/api/auth/login/', {
            'username': 'audit_admin',
            'password': 'StrongPass123!',
        })
        self.access_token = response.data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.access_token}')

        self.users_url = '/api/users/'

    def _detail_url(self, user_id):
        return f'/api/users/{user_id}/'

    # 1. Creating a user writes an AuditLog record
    def test_create_user_writes_audit_log(self):
        from core.models import AuditLog

        payload = {
            'username': 'audit_new_user',
            'email': 'audit_new@example.com',
            'password': 'StrongPass123!',
        }
        response = self.client.post(self.users_url, payload)
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)

        logs = AuditLog.objects.filter(action='CREATE_USER')
        self.assertEqual(logs.count(), 1)

        log = logs.first()
        self.assertEqual(log.entity_type, 'User')
        self.assertEqual(str(log.entity_id), str(response.data['id']))
        # after_json should contain the new user data
        self.assertIsNotNone(log.after_json)
        self.assertEqual(log.after_json['username'], 'audit_new_user')
        self.assertEqual(log.after_json['email'], 'audit_new@example.com')

    # 2. Updating a user writes an AuditLog record with before and after
    def test_update_user_writes_audit_log(self):
        from core.models import AuditLog

        target = CustomUser.objects.create_user(
            username='audit_target',
            email='audit_target@example.com',
            password='StrongPass123!',
        )

        response = self.client.patch(
            self._detail_url(target.id),
            {'first_name': 'UpdatedName'},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        logs = AuditLog.objects.filter(action='UPDATE_USER')
        self.assertEqual(logs.count(), 1)

        log = logs.first()
        self.assertEqual(log.entity_type, 'User')
        self.assertEqual(str(log.entity_id), str(target.id))
        # before_json should have the old state
        self.assertIsNotNone(log.before_json)
        self.assertEqual(log.before_json['first_name'], '')
        # after_json should have the new state
        self.assertIsNotNone(log.after_json)
        self.assertEqual(log.after_json['first_name'], 'UpdatedName')

    # 3. Deleting a user writes an AuditLog record
    def test_delete_user_writes_audit_log(self):
        from core.models import AuditLog

        target = CustomUser.objects.create_user(
            username='audit_delete_target',
            email='audit_delete@example.com',
            password='StrongPass123!',
        )

        response = self.client.delete(self._detail_url(target.id))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)

        logs = AuditLog.objects.filter(action='DELETE_USER')
        self.assertEqual(logs.count(), 1)

        log = logs.first()
        self.assertEqual(log.entity_type, 'User')
        self.assertEqual(str(log.entity_id), str(target.id))
        # before_json should contain the deleted user's data
        self.assertIsNotNone(log.before_json)
        self.assertEqual(log.before_json['username'], 'audit_delete_target')
        # after_json should be None for deletes
        self.assertIsNone(log.after_json)

    # 4. AuditLog captures IP address
    def test_audit_log_captures_ip_address(self):
        from core.models import AuditLog

        payload = {
            'username': 'audit_ip_user',
            'email': 'audit_ip@example.com',
            'password': 'StrongPass123!',
        }
        self.client.post(self.users_url, payload)

        log = AuditLog.objects.filter(action='CREATE_USER').first()
        self.assertIsNotNone(log)
        self.assertIsNotNone(log.ip_address)

    # 5. AuditLog links correct actor
    def test_audit_log_links_correct_actor(self):
        from core.models import AuditLog

        payload = {
            'username': 'audit_actor_user',
            'email': 'audit_actor@example.com',
            'password': 'StrongPass123!',
        }
        self.client.post(self.users_url, payload)

        log = AuditLog.objects.filter(action='CREATE_USER').first()
        self.assertIsNotNone(log)
        self.assertEqual(log.actor_user, self.admin)

    # 6. No audit log on failed operations
    def test_no_audit_log_on_failed_create(self):
        from core.models import AuditLog

        initial_count = AuditLog.objects.count()

        # Missing password — should fail validation
        payload = {
            'username': 'audit_fail_user',
            'email': 'audit_fail@example.com',
        }
        response = self.client.post(self.users_url, payload)
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

        # No new AuditLog records should have been created
        self.assertEqual(AuditLog.objects.count(), initial_count)


class RolePermissionAPITests(TestCase):
    """Tests for TASK-003 — Role & Permission API."""

    def setUp(self):
        self.client = APIClient()

        # Admin user (is_staff=True)
        self.admin = CustomUser.objects.create_user(
            username='role_admin',
            email='role_admin@example.com',
            password='StrongPass123!',
            is_staff=True,
        )

        # Authenticate with JWT
        response = self.client.post('/api/auth/login/', {
            'username': 'role_admin',
            'password': 'StrongPass123!',
        })
        self.access_token = response.data['access']
        self.client.credentials(HTTP_AUTHORIZATION=f'Bearer {self.access_token}')

        self.roles_url = '/api/roles/'
        self.permissions_url = '/api/permissions/'

    def _role_detail_url(self, role_id):
        return f'/api/roles/{role_id}/'

    def _role_permissions_url(self, role_id):
        return f'/api/roles/{role_id}/permissions/'

    # ------------------------------------------------------------------
    # ROLES
    # ------------------------------------------------------------------

    def test_list_roles_returns_200(self):
        """GET /api/roles/ returns 200 for admin."""
        response = self.client.get(self.roles_url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)

    def test_create_role_returns_201(self):
        """POST /api/roles/ with valid name returns 201."""
        response = self.client.post(self.roles_url, {'name': 'Operator'})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['name'], 'Operator')

    def test_create_role_default_type_custom(self):
        """A newly created role defaults to type 'custom'."""
        response = self.client.post(self.roles_url, {'name': 'Inspector'})
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['type'], 'custom')

    def test_retrieve_role_returns_200(self):
        """GET /api/roles/{id}/ returns 200."""
        from users.models import Role
        role = Role.objects.create(name='Viewer')
        response = self.client.get(self._role_detail_url(role.id))
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['name'], 'Viewer')

    def test_patch_role_name_returns_200(self):
        """PATCH /api/roles/{id}/ can update the role name."""
        from users.models import Role
        role = Role.objects.create(name='OldName')
        response = self.client.patch(
            self._role_detail_url(role.id),
            {'name': 'NewName'},
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        role.refresh_from_db()
        self.assertEqual(role.name, 'NewName')

    def test_patch_role_cannot_change_type(self):
        """PATCH should not allow changing the role type field."""
        from users.models import Role
        role = Role.objects.create(name='TypeTest', type='custom')
        self.client.patch(
            self._role_detail_url(role.id),
            {'type': 'system'},
        )
        role.refresh_from_db()
        # Type must remain 'custom' — the update serializer excludes 'type'
        self.assertEqual(role.type, 'custom')

    def test_delete_role_returns_204(self):
        """DELETE /api/roles/{id}/ returns 204."""
        from users.models import Role
        role = Role.objects.create(name='ToDelete')
        response = self.client.delete(self._role_detail_url(role.id))
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Role.objects.filter(pk=role.pk).exists())

    def test_non_admin_cannot_access_roles(self):
        """Non-admin (is_staff=False) user gets 403 on /api/roles/."""
        non_admin = CustomUser.objects.create_user(
            username='role_nonadmin',
            email='role_nonadmin@example.com',
            password='StrongPass123!',
            is_staff=False,
        )
        client = APIClient()
        response = client.post('/api/auth/login/', {
            'username': 'role_nonadmin',
            'password': 'StrongPass123!',
        })
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {response.data["access"]}')

        resp = client.get(self.roles_url)
        self.assertEqual(resp.status_code, status.HTTP_403_FORBIDDEN)

    # ------------------------------------------------------------------
    # PERMISSIONS
    # ------------------------------------------------------------------

    def test_list_permissions_returns_200(self):
        """GET /api/permissions/ returns 200 for any authenticated user."""
        # Use a non-admin authenticated user
        regular = CustomUser.objects.create_user(
            username='perm_regular',
            email='perm_regular@example.com',
            password='StrongPass123!',
            is_staff=False,
        )
        client = APIClient()
        response = client.post('/api/auth/login/', {
            'username': 'perm_regular',
            'password': 'StrongPass123!',
        })
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {response.data["access"]}')

        resp = client.get(self.permissions_url)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)

    def test_list_permissions_unauthenticated_returns_401(self):
        """GET /api/permissions/ without auth returns 401."""
        client = APIClient()
        response = client.get(self.permissions_url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)

    # ------------------------------------------------------------------
    # SET PERMISSIONS ACTION
    # ------------------------------------------------------------------

    def test_set_permissions_on_role(self):
        """POST /api/roles/{id}/permissions/ replaces role permissions."""
        from users.models import Role, Permission

        role = Role.objects.create(name='PermTarget')
        p1 = Permission.objects.create(code='test.perm1', module='Test', description='P1')
        p2 = Permission.objects.create(code='test.perm2', module='Test', description='P2')

        response = self.client.post(
            self._role_permissions_url(role.id),
            {'permissions': [str(p1.id), str(p2.id)]},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK)

        role.refresh_from_db()
        assigned_ids = set(str(p.id) for p in role.permissions.all())
        self.assertEqual(assigned_ids, {str(p1.id), str(p2.id)})

    def test_set_permissions_invalid_uuid_returns_400(self):
        """POST /api/roles/{id}/permissions/ with non-existent UUID returns 400."""
        import uuid as uuid_mod
        from users.models import Role

        role = Role.objects.create(name='BadPermTarget')
        fake_uuid = str(uuid_mod.uuid4())

        response = self.client.post(
            self._role_permissions_url(role.id),
            {'permissions': [fake_uuid]},
            format='json',
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    # ------------------------------------------------------------------
    # SEED COMMAND
    # ------------------------------------------------------------------

    def test_seed_permissions_creates_records(self):
        """Running seed_permissions management command creates Permission records."""
        from django.core.management import call_command
        from users.models import Permission

        # Clear any existing permissions
        Permission.objects.all().delete()
        self.assertEqual(Permission.objects.count(), 0)

        call_command('seed_permissions')

        # The command should have created permissions
        self.assertGreater(Permission.objects.count(), 0)
        # Verify at least a few canonical codes exist
        self.assertTrue(Permission.objects.filter(code='system.admin').exists())
        self.assertTrue(Permission.objects.filter(code='users.manage').exists())
        self.assertTrue(Permission.objects.filter(code='workorders.create').exists())
