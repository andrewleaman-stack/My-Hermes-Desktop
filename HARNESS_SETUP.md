# Harness Setup Protocol

This file describes the one-time initialization flow for the project harness.

## Purpose

Initialize project state files, agent rules, session hooks, decision logs, and sprint tracking so future coding agents can work from shared project context.

## Usage

Run the setup from the project root with an agent capable of reading and writing files. The agent should inspect the repository, create the harness state directory, document product direction, record constraints, and add startup/shutdown procedures.
