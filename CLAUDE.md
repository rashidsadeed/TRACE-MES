# MES Backend Development - Agent Team Guidelines

## Project Context
- This is the backend for an MES system.
- We are strictly developing the backend API. Do not generate, modify, or suggest frontend code.
- The project runs inside a Docker environment. All execution, testing, and dependency management must be done via the existing Docker containers.
- The project documentation, including scope, features, and database schemas, is located in the repository. Refer to it before starting new features.

## Team Roles & Workflow
This project utilizes a 4-agent team. Each agent must strictly adhere to its role:

1. **PM (Lead):** - Reads the project documentation to understand the scope.
   - Breaks down the documentation into actionable Django tasks.
   - Maintains a `TASK_LIST.md` file.
   - Coordinates the Coder, Security, and QA agents.
2. **Coder:** - Claims tasks from the PM.
   - Writes the core Django views, models, and serializers.
   - Focuses strictly on the business logic outlined in the task.
3. **Security:** - Reviews all code produced by the Coder.
   - Checks for vulnerabilities (e.g., ORM injection, broken authentication, IDOR, data exposure).
   - Enforces secure data handling before any task is considered complete.
4. **QA:** - Writes and executes tests (using Django's testing framework or PyTest) inside the Docker container.
   - Ensures the new code does not break existing features.
   - Reports bugs back to the Coder for fixing.

## Execution Rules
- Never write code outside of your designated role.
- Always use the provided peer-to-peer mailbox to coordinate. (e.g., Coder tells QA when a feature is ready for testing).
- Do not mark a task as complete in the `TASK_LIST.md` until Security and QA have both approved the Coder's work.